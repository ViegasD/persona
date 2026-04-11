import { prisma } from '../../shared/database/prisma.js';
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
 * Interpolates dynamic values ({age}, {profession}, {course}) into a scene template.
 */
function interpolateScene(template: string, params: PromptParams): string {
  const rawAge = String(params.ageAtBirthday ?? '');
  const noAge = !rawAge || rawAge === 'sem_idade';
  const age = rawAge.replace(/\D/g, '');
  const profession = params.profession ?? params.occasionDetails ?? 'professional';
  const course = params.graduationCourse ?? params.occasionDetails ?? 'graduation';

  if (noAge) {
    // Strip age-specific phrases so scenes stay natural without a number
    template = template
      .replace(/\s*with the number \{age\}/g, '')
      .replace(/\{age\}\s*/g, '')
      .replace(/number \{age\}\s*on /g, '');
  } else {
    template = template.replace(/\{age\}/g, age || '??');
  }

  return template
    .replace(/\{profession\}/g, profession)
    .replace(/\{course\}/g, course);
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
 * Cada imagem do batch recebe uma cena completa e distinta via buildPromptVariations().
 */
export function buildPrompt(params: PromptParams, sceneDescription?: string): string {
  const parts: string[] = [];

  // 1. Face identity instruction
  parts.push(buildIdentityInstruction(params));

  // 2. Complete scene description (replaces old shared occasion context + pose)
  if (!sceneDescription) {
    const occ = params.occasion.toLowerCase().trim();
    const pack = SCENE_PACKS[occ] ?? SCENE_PACKS.default;
    sceneDescription = interpolateScene(pack[0], params);
  }
  const subject = params.isCoupleShot
    ? 'Generate a natural, candid-looking photograph of this same couple:'
    : 'Generate a natural, candid-looking photograph of this same person:';
  parts.push(`${subject} ${sceneDescription}.`);

  // 3. Extra context provided by the user
  if (params.occasionDetails) {
    parts.push(params.occasionDetails);
  }
  if (params.additionalNotes) {
    parts.push(params.additionalNotes);
  }

  // 4. Realism hierarchy
  parts.push(REALISM_BLOCK);

  // 5. No-age constraint (client declined to provide age for birthday)
  const rawAge = String(params.ageAtBirthday ?? '');
  const noAge = !rawAge.replace(/\D/g, '') || rawAge === 'sem_idade';
  if (noAge && params.occasion.toLowerCase().trim() === 'aniversario') {
    parts.push('Do NOT include any age numbers, numbered candles, numbered balloons, or any text or decoration showing the person\'s age in the image.');
  }

  // 6. Exclusion constraint
  if (params.isCoupleShot) {
    parts.push('Only the two people from the reference photos should appear — no other faces, people, or bystanders in the image.');
  } else {
    parts.push('Only this exact person should appear in the image — no other faces, people, or bystanders.');
  }

  const prompt = parts.join(' ');
  log.debug({ occasion: params.occasion, promptLength: prompt.length, hasStyleTemplate: params.hasStyleTemplate, hasScene: !!sceneDescription }, 'Prompt gerado');
  return prompt;
}

/**
 * Complete scene packs per occasion — each entry is a self-contained visual brief with
 * environment, lighting, wardrobe, props, pose and mood. Placeholders: {age}, {profession}, {course}.
 */
const SCENE_PACKS: Record<string, string[]> = {
  aniversario: [
    'Indoor living room birthday party — leaning forward to blow out {age} candles on a homemade chocolate cake, cheeks puffed mid-breath, warm overhead chandelier casting uneven shadows, scattered paper plates and crumpled napkins on the table',
    'Holding a wrapped gift mid-unwrap, torn wrapping paper in one hand, genuine wide-eyed surprise, sitting cross-legged on a couch, colorful balloons with the number {age} floating behind, natural window light from the left',
    'Close-up portrait wearing a slightly crooked cardboard birthday crown, confetti in hair and on shoulders, mid-laugh with one eye more squinted than the other, warm tungsten glow from party string lights behind',
    'Raising a glass in a birthday toast, slight head tilt, easy half-smile, seated at a crowded table with cake remnants and paper cups, a sagging Feliz Aniversario banner behind, warm overhead bulb light',
    'Standing among scattered balloons, one balloon string tangled around their wrist, candid mid-conversation expression with one hand gesturing, living room with furniture pushed aside, mixed window and lamp light',
    'Cutting the birthday cake with focused downward gaze, one hand steadying the plate, number {age} on a cake topper, crumbs and icing smears on tablecloth, slightly cluttered party table behind',
    'Outdoor backyard birthday gathering, string lights overhead, golden-hour side light, holding a paper plate with food, relaxed standing pose leaning against a fence, other party items on a picnic table behind',
    'Post-party quiet moment seated at the table now mostly cleared, one deflating balloon still tied to a chair, holding the last slice of cake, contemplative small smile, warm dim room light from a single lamp',
  ],
  profissional: [
    'Corporate headshot at a clean desk with a {profession} workspace — laptop and coffee mug to one side, window light from the right casting a natural shadow on the wall, direct eye contact, small composed asymmetric smile, professional attire',
    'Three-quarter body shot standing near a glass office partition, cityscape faintly visible through the window behind, weight shifted to one leg, one hand casually in a pocket, professional attire appropriate for a {profession}, overhead fluorescent mixed with window daylight',
    'Seated in a conference room, one arm on the table, relaxed posture leaning slightly back, a whiteboard with dry-erase writing blurred behind, natural side light from a corridor window, confident calm expression',
    'Close headshot against a neutral office wall, shallow depth of field, a thin shadow line from a window frame crossing the wall behind, natural relaxed expression with slight brow awareness, professional clothing for a {profession}',
    'Standing by a bookshelf in an office, arms loosely crossed, slight head tilt, book spines and a few personal items visible, warm overhead track lighting, the poised stance of a working {profession}',
    'Walking down an office hallway, captured mid-stride with slight motion blur on the back foot, glancing at the camera with a brief composed smile, overhead panel lights receding in perspective behind',
    'At a standing desk with a monitor, one hand resting on the surface, half-turned toward camera, natural posture, real-world desk clutter visible — sticky notes, a cable — daylight from a nearby window',
    'Outdoor terrace or courtyard near the workplace, city buildings slightly out of focus in the background, natural midday light, relaxed but professional stance, jacket over one arm, approachable half-smile',
  ],
  formatura: [
    'The moment of cap toss — arm fully extended upward, black academic cap mid-air against a blue campus sky, wide joyful grin, other {course} graduates as blurred figures behind, bright outdoor daylight',
    'Both hands gripping a rolled diploma, looking down at it with an emotional half-smile, eyes slightly glistening, graduation gown draped properly, outdoor campus lawn with trees and brick buildings behind, afternoon sun from the left',
    'Close-up portrait in academic cap, tassel hanging across the forehead, wide genuine toothy grin, one small strand of hair escaping the cap, campus greenery out of focus behind, warm outdoor light, proud {course} graduate',
    'Full-body shot standing on campus stone steps, graduation gown flowing with a slight breeze, one hand in pocket beneath the gown, relaxed proud posture, ornate campus building entrance visible behind, late-afternoon directional light',
    'Candid mid-laugh with head tilted back, cap pushed back on head, holding diploma loosely in one hand, campus walkway lined with trees, dappled sunlight through leaves, other gowns blurred in the background',
    'Walking down a tree-lined campus path, gown billowing slightly from movement, confident purposeful stride, looking at the camera with a calm assured expression, long shadows on the pavement from low sun, completing {course}',
    'Reading the diploma text up close, head slightly bowed, pride visible in a subtle private smile, golden late-afternoon sun backlighting the hair, campus courtyard columns behind',
    'Seated on a campus bench, cap placed beside them, diploma resting on their lap, reflective quiet moment, one hand on the bench, old campus buildings in the background, warm diffused light through scattered clouds',
  ],
  casal: [
    'Facing each other at a small cafe table mid-conversation, one gesturing, the other caught mid-laugh, coffee cups and a small pastry between them, warm afternoon light through a cafe window, shallow depth of field',
    'Walking hand-in-hand down a sidewalk, slight forward motion blur on their feet, both glancing at each other with easy grins, tree-lined street with parked cars behind, golden-hour sidelight',
    'Foreheads nearly touching, eyes closed, a tender quiet moment, overhead cafe pendant light creating a warm pool around them, table clutter visible to the side (a phone, a glass), intimate close framing',
    'Both looking at the camera from a park bench, one arm over the other shoulder, genuine relaxed double smile, green park behind with an incidental dog-walker blurred in background, soft overcast daylight',
    'Cooking together in a bright kitchen, flour on one person hands, the other stirring a pot, both mid-laugh, overhead kitchen light, real counter clutter (cutting board, spice jars) visible, candid moment',
    'One person resting head on the other shoulder while seated, contemplative peaceful expressions, window light from behind creating soft rim glow on both, couch cushion and a throw blanket partially visible, quiet intimate mood',
    'Dancing together informally in a living room, a phone playing music visible on a shelf, mid-turn with one arm extended, natural smiles, warm lamp light, unposed spontaneous feel',
    'Sitting together on a balcony, twilight sky behind, both holding mugs, leaning on a railing, relaxed side-by-side closeness, cool blue ambient mixed with warm interior light from behind them',
  ],
  gravidez: [
    'Standing near a large window, hands cradling the bump from below, looking down with a calm contemplative expression, soft diffused daylight wrapping around the belly, wearing a loose flowing dress, a simple nursery chair visible in the room',
    'Side profile silhouette near sheer curtains, daylight outlining the bump, dress fabric slightly stirred by a breeze, serene inward expression, minimal accessories, clean simple interior',
    'Seated in a cozy armchair, one hand resting on the bump, the other holding a warm mug on the armrest, soft overhead reading lamp, a baby book or pair of tiny shoes on the side table, gentle comfortable smile',
    'Standing in a garden in late afternoon, loose summer dress, golden light coming from behind, one hand on the bump, the other brushing hair from the face, flowers softly blurred in the background',
    'Close-up portrait from waist up, both hands on the bump, genuine warm expression looking at the camera, natural indoor light from a nearby window, soft neutral wall behind, subtle glow on the skin',
    'Lying propped up on a daybed with sheer white fabric, dappled light through a window, relaxed pose with one knee bent, one hand on the bump, peaceful calm mood, minimal soft-toned room',
    'Partner hands placed on the bump from behind while both look down at it together, warm indoor light, simple comfortable clothing, an intimate candid moment rather than a posed one',
    'Walking slowly along a shore, bare feet on wet sand, flowing dress catching a light wind, wide relaxed stride, golden-hour sidelight, expansive sky behind',
  ],
  familia: [
    'The whole family clustered on a well-worn couch, some leaning into each other, a child on a lap, natural overhead living room light, shelves and framed photos behind, mixed expressions — one kid distracted, adults smiling',
    'Close group portrait in a doorway, everyone squeezed in, the tallest ducking slightly, mixed genuine smiles and one person caught mid-blink, natural daylight from outside flooding in around them',
    'Family at a kitchen table mid-meal, plates and serving bowls visible, one person passing a dish, another caught mid-laugh, overhead pendant light, real kitchen background with fridge magnets and a calendar on the wall',
    'Outdoor backyard portrait, dappled tree shade across their faces, kids slightly fidgeting or looking different directions, parents with patient happy expressions, green grass and a garden hose visible behind',
    'Group hug with arms wrapped around each other, some faces partially hidden behind shoulders, warm natural light, spontaneous genuine moment rather than a stiff pose',
    'Walking together in a park, varied heights and strides, the smallest child holding a parent hand, afternoon directional sunlight, a path stretching behind them',
    'Sitting together on porch steps, staggered heights, a pet squeezed in, relaxed unposed arrangement, warm overhead porch light, a doormat and potted plant visible, easy contented expressions',
    'Everyone looking at the camera in the living room, attempting a proper family photo but with natural imperfections — one child looking up, another slightly blurred from moving, warm lamp light, shelves behind',
  ],
  infantil: [
    'Sitting on a carpet surrounded by scattered building blocks and crayons, looking up at the camera with wide round curious eyes, bright window light spilling across the floor, small shoes kicked off nearby',
    'Mid-laugh with mouth wide open, hands caught slightly blurred from clapping, bright indirect window light, a colorful play mat below, toy cars and a stuffed animal in the background',
    'Deep in concentration stacking wooden blocks, tongue poking out slightly, soft overhead room light, a small table at their height, other toys and a half-eaten snack on a nearby plate',
    'Close-up portrait, big round eyes with a shy half-smile, a faint smudge of paint on one cheek, soft natural daylight from a window, a crumpled drawing taped to the wall behind',
    'Running barefoot on a grassy lawn, slight motion blur on the legs, genuine mid-laugh expression, sunny but not harsh outdoor light, a garden fence or sandbox visible behind',
    'Holding a helium balloon string with both hands, head tilted back watching it bob, an expression of pure wonder, outdoor park with trees, warm afternoon sidelight',
    'Drawing with chunky crayons at a small child-sized table, colorful artwork spread out, focused downward gaze, overhead room light, some crayon smudges on the table surface',
    'Playing peek-a-boo from behind a curtain, peeking out with a wide delighted grin, half the face hidden, natural indoor light, the spontaneous joy of the game',
  ],
  fitness: [
    'Standing with arms crossed in a gym, overhead fluorescent light, visible chalk dust on hands, focused determined expression, squat rack and weight plates blurred behind, athletic wear with visible creases and use',
    'Mid-rep holding a dumbbell at shoulder height, slight grimace of effort, veins lightly visible on the forearm, a gym mirror with blurred reflections behind, rubber floor visible, direct overhead light',
    'Outdoor park mid-run, slight motion blur on the feet, natural sweat sheen on the forehead and neck, determined forward gaze, trees and a path beside them, bright midday outdoor light',
    'Close-up leaning against a piece of gym equipment, catching breath after a set, towel draped over one shoulder, slightly flushed cheeks, relaxed half-smile of accomplishment, gym background',
    'Standing near a pull-up bar, hands on hips, weight shifted to one leg, relaxed but athletic posture, rubber gym floor and weight bench visible, overhead strips of fluorescent light',
    'Stretching one arm across the body outdoors in a park, squinting slightly from sunlight, athletic shoes on grass, a water bottle at their feet, morning golden light, trees behind',
    'Sipping from a water bottle post-workout, slightly flushed face, gym bag on the ground beside them, concrete gym area or a bench, natural outdoor light, honest exertion afterglow',
    'Kettlebell swing captured mid-motion, intense focused expression, hands gripping the handle, feet planted wide on the rubber floor, overhead gym light, a wall clock or poster blurred behind',
  ],
  natalino: [
    'Sitting cross-legged on the floor next to a Christmas tree, string lights reflected as small catchlights in the eyes, wearing a thick knitted sweater, relaxed easy smile, wrapped presents scattered around, warm tungsten glow',
    'Holding a wrapped gift box in both hands, looking down at it rather than the camera, warm golden glow from tree lights behind, a fireplace mantel with stockings visible, cozy ambient mood',
    'Seated in a big armchair near a fireplace, one side of the face lit by a warm fire glow, cozy holiday sweater, legs tucked under a blanket, a mug of hot cocoa on the armrest, relaxed slouched posture',
    'Standing by a frost-edged window, wearing a red or green knitted sweater, cool blue daylight from outside mixing with warm yellow interior lamp light, a decorated tree reflected faintly in the glass',
    'Reaching up to hang an ornament on the tree, caught mid-action, one hand extended, an open box of ornaments at their feet, string lights already on the tree, natural candid moment, warm overhead room light',
    'Seated at a holiday dinner table with candles and festive dishes, mid-conversation expression, amber candlelight casting upward shadows, a poinsettia centerpiece, relatives blurred in the background',
    'Outdoors on a porch, a light frost in the air, wearing a scarf and a winter coat, breath slightly visible in the cold, string lights on the house behind, calm winter evening light',
    'Mid-unwrap of a Christmas present, wrapping paper torn and falling, genuine surprised happy expression, sitting on the floor beside the tree, ribbon and tissue paper scattered, warm tree-light glow',
  ],
  debutante: [
    'Full-length portrait in a long formal gown, standing beside a marble column in a ballroom venue, warm overhead chandelier light casting intricate shadows, composed but not rigid posture, one hand lightly touching the column',
    'Close portrait with a small delicate tiara catching the light, slight head tilt, one side of the face in soft shadow from the chandelier above, rich fabric of the gown visible at the neckline, warm amber tone',
    'Mid-twirl with the gown fabric fanning outward, slight motion blur at the hem, caught between poses, a polished floor reflecting the chandelier lights, one arm gracefully extended, a genuine in-the-moment smile',
    'Seated on a cushioned settee in the venue, holding a small bouquet of flowers, looking down at them with a quiet reflective expression, ornate wallpaper or drapes visible behind, soft warm interior light',
    'Standing at the top of a grand staircase, one hand on the polished railing, looking back over the shoulder toward the camera, the staircase descending behind with guests blurred below, overhead warm light',
    'Close portrait with chandelier bokeh behind creating soft golden circles, relaxed asymmetric smile, one earring catching a sparkle of light, warm amber tones throughout, shallow depth of field',
    'On the dance floor mid-step, gown swaying, one hand held slightly out as if just released from a dance partner, ballroom visible behind with tablecloths and chair covers, mixed warm overhead light',
    'Standing beside a large arched window in the venue, natural blue twilight from outside mixing with warm chandelier light from within, a contemplative elegant stance, full-length gown visible, the venue architecture framing the shot',
  ],
  pet: [
    'Laughing as the pet licks their face, expression scrunched up with genuine surprise, both on the floor, natural indoor light from a nearby window, a pet toy and a water bowl visible in the background',
    'Seated on a couch with the pet curled up against them, one hand scratching behind the pet ear, relaxed comfortable smile, warm lamp light, a throw blanket bunched up, real living room background',
    'The pet nuzzling their chin, eyes half-closed in a tender unguarded moment, soft window light from the side, simple home background with a shelf or doorway, gentle warm tone',
    'Both looking at the camera — the pet slightly blurred from a head turn, owner with a patient amused expression, sitting on a porch or garden step, outdoor afternoon light, a leash or ball visible nearby',
    'Outdoors on green grass, the pet mid-stride running toward them, crouching with arms open and a wide anticipatory grin, natural afternoon sunshine, a park fence or trees behind',
    'The pet resting on their lap while they sit in a chair, looking down at the pet with a soft quiet smile, warm reading-lamp light, a book or phone on the side table, peaceful domestic scene',
    'Playing tug-of-war with a rope toy, both leaning back mid-action with slight blur on the toy, playful determination on the face, indoor or backyard setting, natural light',
    'Walking the pet on a path in a park, the pet pulling slightly ahead on the leash, grinning at the camera with a patient shrug, trees and dappled sunlight, candid mid-walk moment',
  ],
  casual: [
    'Sitting on cafe steps, one hand around a paper coffee cup, watching people pass on the sidewalk, relaxed expression, warm afternoon sidelight, the cafe sign and a bicycle parked nearby',
    'Leaning against a textured wall — brick or painted concrete — hands loosely in jacket pockets, a relaxed easy half-smile, natural overcast diffused light, a faded poster on the wall behind',
    'Walking through a street market, slight motion blur, caught mid-glance back at the camera, colorful stalls and hanging items blurred behind, bright outdoor daylight, candid documentary feel',
    'Seated at an outdoor cafe table, sunglasses pushed up on their head, arms resting on the table, a glass of water and a phone beside them, dappled shade from an umbrella, easy composed smile',
    'Standing on a pedestrian bridge, cityscape or river behind slightly out of focus, wind lifting their hair, natural overcast light, relaxed neutral expression with hands on the railing',
    'On a park bench under a tree, dappled spotted shade on the face and clothes, one arm along the back of the bench, contemplative but relaxed expression, a book loosely held, afternoon light',
    'Browsing books or records in a shop, caught mid-flip, absorbed natural expression looking down, warm interior shop lighting, shelves stacked with items creating a textured background',
    'Standing near a bicycle, one hand resting on it, relaxed casual posture, an urban street or park path behind, golden-hour warm sidelight, wearing comfortable everyday clothes',
  ],
  default: [
    'Natural relaxed standing pose, weight on one hip, faint asymmetric smile, looking at the camera, in a real-world location with incidental background objects, soft ambient window light from the left',
    'Three-quarter turn, looking slightly past the lens, one hand resting at their side, shallow depth of field, a neutral wall or doorway in the background, natural diffused daylight',
    'Full-body shot in a simple environment, hands loosely at sides, real-world background with a chair, a plant, or a shelf, natural overhead room light, calm neutral expression',
    'Close-up with direct eye contact, one eyebrow very slightly raised, natural indoor ambient light, a hint of the room behind out of focus, honest natural expression',
    'Caught mid-motion turning toward the camera, slight motion blur on the hair, a candid unposed moment mid-step, natural mixed lighting from windows and room lamps',
    'Profile view looking to the side, jaw and ear clearly visible, light from behind creating a thin rim along the cheek and shoulder, a window or doorway as the light source, contemplative expression',
    'Seated on steps, a bench, or a low wall, elbows resting on knees, relaxed thoughtful expression, the surrounding environment visible — brick, concrete, or wood — natural diffused light',
    'Backlit with light wrapping softly around the hair and shoulders, face in gentle open shade, warm golden tone, a real setting like a park or a doorway, relaxed genuine expression',
  ],
};

/**
 * Queries the DB for scene prompts generated by GPT-4o vision for the given occasion.
 * Returns an empty array if the occasion has no active templates.
 */
async function getDbScenePacks(occasion: string): Promise<string[]> {
  try {
    const occ = await prisma.occasion.findFirst({
      where: { slug: occasion, isActive: true },
      include: { templates: { where: { isActive: true }, select: { scenePrompt: true } } },
    });
    if (!occ || occ.templates.length === 0) return [];
    return occ.templates.map((t) => t.scenePrompt);
  } catch (err) {
    log.warn({ occasion, err }, 'Failed to query DB for scene packs — falling back to hardcoded');
    return [];
  }
}

/**
 * Gera uma prompt completa por imagem do batch, cada com cena distinta.
 * Queries the DB first for GPT-4o-generated scene prompts; falls back to hardcoded SCENE_PACKS.
 */
export async function buildPromptVariations(params: PromptParams, count: number): Promise<string[]> {
  const occ = params.occasion.toLowerCase().trim();
  const dbScenes = await getDbScenePacks(occ);
  const pack = dbScenes.length > 0 ? dbScenes : (SCENE_PACKS[occ] ?? SCENE_PACKS.default);
  return Array.from({ length: count }, (_, i) => {
    const scene = interpolateScene(pack[i % pack.length], params);
    return buildPrompt(params, scene);
  });
}
