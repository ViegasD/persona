import { createChildLogger } from '../../shared/utils/logger.js';

const log = createChildLogger('prompt-engine');

export interface PromptParams {
  occasion: string;
  occasionDetails?: string;
  additionalNotes?: string;
  // Structured occasion-specific fields
  ageAtBirthday?: string;
  profession?: string;
  graduationCourse?: string;
  // Template control
  hasStyleTemplate?: boolean;  // whether a style template image is appended to referenceImages
  isCoupleShot?: boolean;      // casal occasion — allows two people in output
}

/**
 * Motor de composição de prompts otimizado para Gemini 3.1 Flash Image (Nano Banana 2).
 * Usa prosa natural seguindo as recomendações do Google Imagen: Subject → Context → Style → Quality.
 *
 * REALISM RULES (from hyper-realism skill):
 * - NEVER use: "photorealistic", "ultra detailed", "8K", "4K", "HDR", "beautiful",
 *   "flawless", "perfect", "stunning", "gorgeous", "studio lighting", "dramatic lighting",
 *   "highly detailed" — these push toward retouched/rendered look.
 * - ALWAYS address the 6-tier realism hierarchy: skin texture, eyes, hair, expression, lighting, background.
 */

/**
 * Realism block replaces old BASE_QUALITY. Addresses all 6 tiers of the realism hierarchy
 * with grounded, imperfect descriptors instead of beauty-filter trigger words.
 */
const REALISM_BLOCK =
  'Skin: visible pores on forehead and nose, subtle unevenness in skin tone, faint under-eye shadows, ' +
  'natural micro-texture — not smoothed or airbrushed. ' +
  'Eyes: slight moisture reflection, fine red capillaries in the sclera, natural catchlight from the environment, ' +
  'iris has organic color variation — not uniformly saturated. ' +
  'Hair: a few flyaway strands, natural frizz at the hairline, individual hairs catching light differently — ' +
  'not uniformly smooth or perfectly styled. ' +
  'Expression: slightly asymmetric — one eye a fraction more open, one corner of the mouth slightly higher, ' +
  'natural mid-motion feel rather than a held pose. ' +
  'Lighting: single dominant light source consistent with the environment, soft natural falloff on the shadow side, ' +
  'no fill light that flattens the face. ' +
  'Background: specific to the location with incidental real-world objects, slight depth-of-field blur, ' +
  'not a generic gradient or seamless backdrop.';

/**
 * Builds the occasion-specific scene description using structured details.
 */
function buildOccasionContext(params: PromptParams): string {
  const { occasion, ageAtBirthday, profession, graduationCourse, occasionDetails } = params;
  const occ = occasion.toLowerCase().trim();

  switch (occ) {
    case 'aniversario': {
      const age = ageAtBirthday?.replace(/\D/g, '') ?? '';
      const ageDesc = age ? `a ${age}-year-old person` : 'a person';
      const decor = age
        ? `balloons and decorations with the number ${age}, a birthday cake with ${age} candles`
        : 'colorful birthday balloons and a birthday cake';
      return `a birthday celebration for ${ageDesc}, featuring ${decor}, some confetti on the table, warm overhead light like a living room chandelier`;
    }
    case 'profissional': {
      const prof = profession ?? occasionDetails ?? 'professional';
      return `a workplace headshot for a ${prof} — real office or workspace background with visible desk clutter, window light from one side casting a natural shadow, wearing professional attire appropriate for a ${prof}`;
    }
    case 'formatura': {
      const course = graduationCourse ?? occasionDetails ?? 'graduation';
      return `a ${course} graduation scene, wearing academic cap and gown for ${course}, holding a rolled diploma, outdoor campus setting with trees and other graduates blurred in the background`;
    }
    case 'casal':
      return 'a couple portrait with two people close together, natural relaxed body language, shot in a real location like a park bench or café table, warm afternoon window light';
    case 'gravidez':
      return 'a maternity portrait, the subject cradling their bump, wearing a loose flowing dress, standing near a window with soft diffused daylight, calm unhurried atmosphere';
    case 'familia':
      return 'a family portrait in a lived-in environment like a living room or backyard, natural unposed body language, overhead daylight or lamp light, genuine relaxed expressions';
    case 'infantil':
      return 'a children portrait in a playful setting with scattered toys or colored objects, bright but not harsh window light, spontaneous genuine expression';
    case 'fitness':
      return 'an athletic portrait in a real gym or outdoor setting, wearing workout clothes with visible sweat or exertion, overhead fluorescent or natural outdoor light, determined focused expression';
    case 'natalino':
      return 'a Christmas portrait next to a decorated tree with string lights, warm tungsten glow from the lights, wearing a casual holiday sweater, relaxed genuine expression';
    case 'debutante':
      return 'a debutante portrait in a formal venue with visible chandeliers and wall details, wearing a long formal gown, warm amber overhead light, composed but natural expression';
    case 'pet':
      return 'a portrait with the person and their pet together, real home or park setting, the pet slightly in motion or looking away, natural window or outdoor light';
    default:
      return `a ${occasion} themed portrait in a real-world location with incidental background details, natural ambient light from the environment`;
  }
}

/**
 * Builds the face identity instruction at the top of the prompt.
 * Written as natural language so Gemini 3.1 Flash Image follows it reliably.
 */
function buildIdentityInstruction(params: PromptParams): string {
  const base =
    'You are given reference photos of a real person. Carefully study every detail of their face — ' +
    'the exact shape and color of their eyes, their nose structure, lip shape, skin tone, complexion, ' +
    'and hair color and texture. ';

  if (params.hasStyleTemplate) {
    return (
      base +
      'The last reference image is a visual style guide only — replicate its lighting quality, ' +
      'background setting, and color grading, but do not copy the people or poses from it. ' +
      'Generate a brand new, natural pose for the subject.'
    );
  }

  return base + 'Preserve this exact person\'s identity precisely in the generated image.';
}

/**
 * Gera o prompt completo para a Kie.ai API (Nano Banana 2 / Gemini 3.1 Flash Image).
 * Cada imagem do batch deve receber uma variação de pose via buildPromptVariations().
 */
export function buildPrompt(params: PromptParams, poseVariation?: string): string {
  const occasionContext = buildOccasionContext(params);
  const parts: string[] = [];

  // 1. Face identity instruction — explicit natural language (Gemini follows this well)
  parts.push(buildIdentityInstruction(params));

  // 2. Subject + scene description (no banned words like "photorealistic")
  const subjectDesc = params.isCoupleShot
    ? `Generate a natural, candid-looking portrait of this same couple in ${occasionContext}.`
    : `Generate a natural, candid-looking portrait of this same person in ${occasionContext}.`;
  parts.push(subjectDesc);

  // 3. Pose (per-image variation for batch diversity)
  if (poseVariation) {
    parts.push(`Pose: ${poseVariation}.`);
  }

  // 4. Extra context provided by the user
  if (params.occasionDetails) {
    parts.push(params.occasionDetails);
  }
  if (params.additionalNotes) {
    parts.push(params.additionalNotes);
  }

  // 5. Realism hierarchy — grounded imperfect details (replaces old BASE_QUALITY)
  parts.push(REALISM_BLOCK);

  // 6. Exclusion constraint — phrased as a positive instruction
  if (params.isCoupleShot) {
    parts.push('Only the two people from the reference photos should appear — no other faces, people, or bystanders in the image.');
  } else {
    parts.push('Only this exact person should appear in the image — no other faces, people, or bystanders.');
  }

  const prompt = parts.join(' ');
  log.debug({ occasion: params.occasion, promptLength: prompt.length, hasStyleTemplate: params.hasStyleTemplate, hasPoseVariation: !!poseVariation }, 'Prompt gerado');
  return prompt;
}

/**
 * Pose variations per occasion — used by buildPromptVariations() to give each batch
 * image a unique scene so the output is diverse rather than the same shot repeated.
 */
const VARIATIONS_BY_OCCASION: Record<string, string[]> = {
  aniversario: [
    'leaning forward to blow out candles, mid-breath with cheeks slightly puffed, warm overhead light casting shadows on the cake',
    'holding a slice of cake on a paper plate, caught mid-laugh with one eye slightly squinted, crumbs on the table',
    'standing among scattered balloons, looking at the camera with a relaxed lopsided grin, one hand resting on a chair',
    'wearing a crooked birthday crown, candid mid-conversation expression, party cups and plates visible behind',
    'confetti stuck in their hair, caught mid-clap, natural motion blur on the hands',
    'raising a glass in a toast, slight head tilt, warm lamp light from behind creating a rim glow on one side',
  ],
  profissional: [
    'headshot with direct eye contact, slight asymmetric smile, visible office window reflection in one eye',
    'arms loosely crossed, weight shifted to one leg, blurred whiteboard with writing in the background',
    'three-quarter turn looking past the camera, natural resting expression, one hand on a desk edge',
    'seated at a desk with a laptop open, relaxed posture leaning back slightly, daylight from a side window',
    'standing near a glass partition, reflection faintly visible, composed but not rigid expression',
    'close headshot, slight furrow between the brows suggesting thought, neutral wall with a shadow line behind',
  ],
  formatura: [
    'tossing graduation cap upward, caught mid-throw with arm extended, campus trees and sky behind',
    'both hands gripping diploma, looking down at it, emotional half-smile, other graduates blurred behind',
    'close-up wearing academic cap slightly askew, wide genuine grin, tassel hanging across the forehead',
    'full body in graduation gown, standing on campus steps, one hand in pocket, relaxed proud posture',
    'candid mid-laugh with classmates blurred behind, cap pushed back, sunlight from the left',
    'reading the diploma text, head slightly bowed, warm late-afternoon outdoor light',
  ],
  casal: [
    'looking at each other mid-conversation, one person slightly blurred, natural depth of field',
    'both laughing at something off-camera, caught in a candid unposed moment, hands interlocked loosely',
    'foreheads nearly touching, eyes closed, natural overhead café light, table clutter visible',
    'walking together on a sidewalk, slight motion blur on feet, candid documentary feel',
    'one person resting head on the other\'s shoulder, relaxed quiet moment, window light from behind',
    'holding hands across a small table, both looking at camera with relaxed easy smiles, drinks on the table',
  ],
  gravidez: [
    'both hands cradling the bump from below, looking down with a calm thoughtful expression, window light from one side',
    'side profile near a window, soft daylight wrapping around the bump, loose dress fabric catching a slight breeze',
    'sitting in an armchair with one hand on the bump, relaxed half-smile, a book or mug on the side table',
    'standing with weight shifted to one hip, hands resting on the bump, natural unposed stance, soft indoor light',
    'close-up of face and upper body, gentle inward-looking expression, natural skin glow from nearby window',
    'outdoors in late afternoon light, walking slowly on grass, loose dress, warm golden ambient glow',
  ],
  familia: [
    'the whole family grouped on a couch, some leaning into each other, natural overhead room light, lived-in background',
    'close group portrait, one kid looking slightly away, adults with relaxed genuine smiles, daylight from a window',
    'family caught mid-laugh at something off-camera, natural unposed moment, kitchen or living room setting',
    'everyone looking at the camera, one person blinking or mid-expression, warm overhead lamp light',
    'outdoor backyard portrait, dappled tree shade on faces, kids slightly restless, parents relaxed',
    'group hug with arms around each other, some faces partially hidden, warm natural light',
  ],
  infantil: [
    'sitting on the floor surrounded by scattered toys, looking up at the camera with wide curious eyes',
    'mid-laugh with mouth wide open, slightly blurry hands from clapping, bright window light',
    'concentrating on stacking blocks, tongue slightly out, natural overhead room light',
    'close-up with big round eyes and a half-smile, a smudge on one cheek, soft daylight',
    'running outdoors on grass, slight motion blur, sunny but not harsh light, candid moment',
    'holding a balloon string, looking at it going up, genuine wonder on the face, outdoor park light',
  ],
  fitness: [
    'standing with arms crossed in a gym, overhead fluorescent light, chalk dust visible on hands, focused expression',
    'mid-rep with a dumbbell, veins slightly visible on forearm, mirror reflection blurred behind, slight grimace of effort',
    'outdoor park setting mid-run, slight motion blur, natural sweat on forehead, determined eyes',
    'close-up portrait leaning against gym equipment, catch-breath expression, towel over one shoulder',
    'standing near a pull-up bar, hands on hips, relaxed but athletic posture, rubber floor visible below',
    'stretching one arm across the body outdoors, squinting slightly from sunlight, athletic wear with visible creases',
  ],
  natalino: [
    'sitting cross-legged next to a Christmas tree, string lights reflected in eyes, relaxed easy smile',
    'holding a wrapped gift box, looking at it rather than the camera, warm tungsten glow from tree lights',
    'seated near a fireplace, face lit from one side by the fire glow, cozy sweater, relaxed slouch',
    'wearing a knitted holiday sweater, standing by a window with frost, natural cool daylight mixed with warm interior light',
    'candid moment decorating the tree, reaching up to hang an ornament, caught mid-action',
    'at a table with holiday food and candles, mid-conversation expression, warm amber candlelight on the face',
  ],
  debutante: [
    'full-length in a formal gown, standing near a column in a venue, warm overhead chandelier light, composed posture',
    'close portrait with a small tiara, slight head tilt, one side of face in soft shadow from overhead light',
    'mid-twirl with the gown fabric in motion, slight motion blur at the hem, caught between poses',
    'seated on a cushioned bench holding a small bouquet, looking down at the flowers, quiet reflective moment',
    'standing at the top of a staircase, hand on the railing, looking back over shoulder, natural overhead light',
    'close portrait with bokeh from chandelier lights behind, relaxed asymmetric smile, warm amber tones',
  ],
  pet: [
    'laughing as the pet licks their face, slightly scrunched-up expression, natural indoor light',
    'sitting on a couch with pet curled up next to them, one hand scratching behind pet\'s ear, relaxed smile',
    'pet nuzzling their chin, eyes half-closed, tender unguarded expression, window light from the side',
    'both looking at camera, pet slightly blurry from movement, owner with a patient amused expression',
    'outdoors on grass, pet mid-stride, owner crouching down with arms open, natural afternoon light',
    'pet resting on their lap, owner looking down at it with a soft quiet smile, warm lamp light',
  ],
  default: [
    'natural relaxed pose, weight shifted to one hip, faint asymmetric smile, looking at the camera',
    'three-quarter turn, looking slightly past the lens, one hand at their side, soft window light from the left',
    'full body standing naturally, hands loosely at sides, real-world background with incidental objects',
    'close-up, direct eye contact, one eyebrow very slightly raised, natural indoor ambient light',
    'caught mid-motion turning toward the camera, slight motion blur on hair, candid unposed feel',
    'profile view looking to the side, jaw and ear visible, light from behind creating a thin rim on the cheek',
    'mid-laugh with eyes slightly squinted, genuine emotion, natural overhead light',
    'seated on steps or a bench, elbows on knees, relaxed thoughtful expression, environment visible',
    'backlit with light wrapping around hair and shoulders, face in gentle open shade, warm tone',
    'low angle looking slightly up, chin lifted, relaxed confident expression, sky or ceiling visible',
    'looking down at something in their hands, soft top-down light, quiet introspective moment',
    'glancing to the side with a half-smile, as if reacting to someone off-camera, natural moment',
  ],
};

/**
 * Gera uma prompt única por imagem do batch, cada com pose distinta.
 * Corrige o bug onde todas as imagens do batch recebiam o mesmo prompt.
 */
export function buildPromptVariations(params: PromptParams, count: number): string[] {
  const occ = params.occasion.toLowerCase().trim();
  const variations = VARIATIONS_BY_OCCASION[occ] ?? VARIATIONS_BY_OCCASION.default;
  return Array.from({ length: count }, (_, i) =>
    buildPrompt(params, variations[i % variations.length]),
  );
}
