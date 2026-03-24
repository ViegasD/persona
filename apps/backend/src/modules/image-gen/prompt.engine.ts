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
 * Evita tags SDXL/Flux (camera gear, tokens como "8K UHD") que não funcionam bem em modelos LLM.
 */

const BASE_QUALITY =
  'professional portrait photography, 4K HDR, sharp facial details, natural skin texture, ' +
  'photorealistic, 35mm portrait lens, soft background bokeh, studio-level lighting quality, ' +
  'high-end color grading';

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
      return `a birthday celebration setting for ${ageDesc}, featuring ${decor}, colorful confetti, and warm celebratory lighting`;
    }
    case 'profissional': {
      const prof = profession ?? occasionDetails ?? 'professional';
      return `a professional portrait setting appropriate for a ${prof} — clean modern background or appropriate workplace environment, professional attire suited for a ${prof}, polished and confident expression`;
    }
    case 'formatura': {
      const course = graduationCourse ?? occasionDetails ?? 'graduation';
      return `a ${course} graduation setting, wearing academic cap and gown appropriate for ${course}, holding a diploma, proud and joyful expression befitting a graduation ceremony`;
    }
    case 'casal':
      return 'a romantic couple portrait setting with two people in love, warm intimate mood, elegant surroundings, soft flattering natural lighting';
    case 'gravidez':
      return 'a maternity photography setting, gentle and elegant pose that highlights the baby bump beautifully, flowing dress, soft diffused natural lighting, serene and tender atmosphere';
    case 'familia':
      return 'a warm family portrait setting, joyful and natural expressions, soft natural lighting, comfortable and harmonious environment';
    case 'infantil':
      return 'a children photography setting, playful and colorful surroundings, bright cheerful lighting, genuine joyful expression';
    case 'fitness':
      return 'a fitness and athletic portrait setting, confident athletic pose, gym or outdoor workout environment, dynamic energetic lighting that highlights strength';
    case 'natalino':
      return 'a Christmas-themed portrait setting with festive holiday decorations, red and green color scheme, warm cozy lighting, cheerful festive atmosphere';
    case 'debutante':
      return 'a debutante ball portrait setting, elegant formal gown, glamorous venue with chandeliers, soft romantic lighting, graceful and poised expression';
    case 'pet':
      return 'a heartwarming portrait setting with the person and their pet, affectionate bond on display, warm natural lighting that flatters owner and pet';
    default:
      return `a ${occasion} themed portrait setting with natural surroundings, flattering and appropriate lighting`;
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

  // 2. Subject + scene description
  const subjectDesc = params.isCoupleShot
    ? `Generate a photorealistic portrait of this same couple in ${occasionContext}.`
    : `Generate a photorealistic portrait of this same person in ${occasionContext}.`;
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

  // 5. Quality modifiers (natural language, not SDXL tags)
  parts.push(BASE_QUALITY);

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
    'blowing out birthday candles on a cake, joyful expression, candid and natural',
    'holding a slice of birthday cake, laughing and delighted',
    'surrounded by colorful balloons, big genuine smile looking at the camera',
    'wearing a birthday crown, festive decorations in the background',
    'candid moment mid-celebration, confetti falling around the subject',
    'toasting with a glass, elegant birthday atmosphere, warm glow',
  ],
  profissional: [
    'confident headshot, direct eye contact, neutral clean background',
    'arms crossed, standing, authoritative yet approachable expression',
    'three-quarter angle, looking slightly to the side, thoughtful',
    'seated at a desk, relaxed and professional environment',
    'standing in an office setting, warm and approachable smile',
    'close-up headshot, slight smile, very clean background',
  ],
  formatura: [
    'throwing graduation cap in the air, euphoric and joyful expression',
    'holding diploma with both hands, proud and emotional expression',
    'close-up portrait wearing academic cap, big genuine smile',
    'full body shot in graduation gown, standing tall and proud',
    'candid laugh during graduation ceremony celebrations',
    'looking down at diploma in hands, proud and reflective moment',
  ],
  casal: [
    'couple gazing at each other, tender and loving eye contact',
    'couple laughing together, candid and genuinely joyful moment',
    'close-up of two faces side by side, warm and intimate mood',
    'couple walking together, natural candid documentary style',
    'romantic embrace, soft diffused dreamy lighting',
    'couple holding hands, both looking at the camera with warm smiles',
  ],
  gravidez: [
    'hands gently cradling baby bump, serene and peaceful expression',
    'elegant side profile silhouette that highlights the baby bump beautifully',
    'sitting gracefully, flowing dress cascading, soft natural light',
    'standing tall with hands resting on belly, confident and radiant',
    'close-up portrait, hands lovingly on bump, warm gentle light',
    'outdoor setting, golden natural light, peaceful glowing expression',
  ],
  familia: [
    'whole family smiling together naturally, candid warm moment',
    'close-up group portrait, joyful and genuine expressions',
    'family sharing a laugh, natural and unposed candid moment',
    'formal portrait with everyone looking at the camera, harmonious',
    'outdoor family portrait, warm golden natural lighting',
    'family in a warm group embrace, loving and cozy atmosphere',
  ],
  infantil: [
    'playing with colorful toys, naturally joyful and candid expression',
    'big genuine laugh, candid and playful spontaneous moment',
    'sitting on the floor, curious wide-eyed expression',
    'close-up portrait, bright expressive eyes, innocent smile',
    'playful outdoor scene, sunny and cheerful natural setting',
    'holding a balloon, carefree and happy expression',
  ],
  fitness: [
    'confident athletic stance, arms crossed, gym background',
    'dynamic power pose showing strength, intense focused expression',
    'outdoor setting suggesting movement and energy, athletic attire',
    'close-up portrait post-workout, confident and proud expression',
    'standing with weights, powerful and composed stance',
    'stretching pose in athletic attire, natural outdoor lighting',
  ],
  natalino: [
    'next to a beautifully decorated Christmas tree, warm holiday glow',
    'holding wrapped Christmas gifts, joyful and festive expression',
    'seated by a fireplace, cozy warm winter atmosphere',
    'wearing a festive holiday sweater, cheerful genuine expression',
    'candid moment of holiday celebration, warm and magical lighting',
    'portrait surrounded by Christmas ornaments and holiday decor',
  ],
  debutante: [
    'graceful full-length portrait in formal gown, standing elegantly',
    'close-up portrait with tiara, elegant and poised expression',
    'gentle dancing pose, elegant movement of the gown',
    'seated elegantly holding a bouquet of flowers, serene expression',
    'standing on a grand staircase, regal and beautiful composition',
    'romantic close-up portrait with soft bokeh lights in background',
  ],
  pet: [
    'laughing together with pet, candid and genuinely joyful moment',
    'cuddling pet close, warm affectionate bond clearly visible',
    'pet nuzzling owner, tender loving close-up portrait',
    'both subject and pet looking at camera together, adorable pair',
    'playful moment with pet outdoors, natural warm lighting',
    'tender portrait with pet resting on lap, warm and cozy',
  ],
  default: [
    'natural relaxed pose, warm genuine expression, looking at the camera',
    'slight smile, three-quarter view, soft bokeh background',
    'full body shot, confident and natural relaxed stance',
    'close-up portrait, direct intense yet warm eye contact',
    'candid natural moment, unposed and authentic expression',
    'profile view, contemplative thoughtful expression, beautiful side light',
    'laughing naturally with genuine joy, authentic emotion',
    'environmental portrait with contextual meaningful background',
    'backlit subject with beautiful rim lighting, artistic dramatic contrast',
    'low camera angle, slightly powerful and confident perspective',
    'high camera angle, gentle gaze downward, soft and introspective',
    'looking slightly away from camera, storytelling composition',
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
