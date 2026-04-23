/**
 * Composite frame + Veo motion prompt builders.
 *
 * For multi-character videos we generate a single composite "starting frame"
 * via Nano Banana and pass it to Veo as image-to-video. This module owns
 * the prompts for both steps so they stay aligned.
 *
 * Prompt structure follows the MaxFusion AI UGC studio template:
 *   - Reference frame tags up front (one per character)
 *   - Scene description (occasion-aware)
 *   - Composition + lighting + mood
 *   - Realism markers (faithful to references, no morphing, etc.)
 *   - Negative directives
 */

export interface CompositeCharacter {
  name: string;
  /** Optional short description (helps the model preserve costume / vibe). */
  description?: string;
}

export interface BuildCompositePromptInput {
  characters: CompositeCharacter[];
  recipientName: string;
  /** Normalized messageType key (e.g. "aniversario"). */
  occasion: string;
  aspectRatio: '16:9' | '9:16';
}

export interface BuildVeoMotionPromptInput {
  characters: CompositeCharacter[];
  /** Which character speaks the script (defaults to the first). */
  speakerIndex?: number;
  /** Normalized messageType key — controls ambient motion. */
  occasion: string;
  script: string;
}

// ─── Scene templates (per occasion) ─────────────────────

interface SceneTemplate {
  /** Static description for the Nano Banana frame. */
  scene: (recipientName: string) => string;
  /** Ambient motion description for the Veo prompt. */
  motion: string;
}

const SCENE_TEMPLATES: Record<string, SceneTemplate> = {
  aniversario: {
    scene: (recipientName) =>
      `Indoor birthday party scene. A decorated round birthday cake sits on a wooden table directly in front of the characters. The name "${recipientName}" is written clearly in cursive piped frosting on top of the cake, perfectly legible, no spelling drift. Pastel-colored balloons (pink, blue, yellow, white) float behind the characters. Soft warm tungsten lighting, gentle confetti suspended in the air, festive but tasteful styling. Characters are gathered around the cake, smiling warmly, looking toward the camera.`,
    motion:
      'The scene is mostly static. Balloons drift gently in the background. Candles on the cake flicker softly. Confetti slowly falls. Camera holds steady with a very subtle slow push-in.',
  },
  parabens: {
    scene: () =>
      'Bright celebratory indoor scene with golden bokeh lights in the background. Characters are gathered close together, smiling proudly toward the camera. Warm cinematic lighting.',
    motion:
      'Background bokeh lights twinkle softly. Camera holds steady with a very subtle push-in. Characters remain mostly still aside from natural breathing and expression changes.',
  },
};

const DEFAULT_SCENE: SceneTemplate = {
  scene: () =>
    'Clean studio backdrop with soft warm lighting. Characters posed together facing the camera, friendly natural expressions, framed from waist up.',
  motion:
    'Camera holds steady. Characters remain still aside from natural breathing and expression changes. No dramatic background motion.',
};

function getScene(occasion: string): SceneTemplate {
  return SCENE_TEMPLATES[occasion] ?? DEFAULT_SCENE;
}

// ─── Builders ───────────────────────────────────────────

/**
 * Build the Nano Banana prompt for the composite starting frame.
 * Reference images are passed separately as inlineData parts; this prompt
 * just tags them by name so the model knows which face goes where.
 */
export function buildCompositePrompt(input: BuildCompositePromptInput): string {
  const { characters, recipientName, occasion, aspectRatio } = input;
  if (characters.length === 0) {
    throw new Error('buildCompositePrompt requires at least one character');
  }

  const refTags = characters
    .map((c) => `[${c.name} Reference Frame]`)
    .join(' ');

  const charactersList = characters
    .map((c, i) => {
      const desc = c.description ? ` — ${c.description}` : '';
      return `${i + 1}. ${c.name}${desc}`;
    })
    .join('\n');

  const scene = getScene(occasion).scene(recipientName);
  const orientation = aspectRatio === '9:16' ? 'vertical 9:16 portrait' : 'horizontal 16:9 landscape';
  const framing = characters.length === 1
    ? 'Single character centered in frame, waist-up.'
    : `All ${characters.length} characters visible together in the same shot, side by side or naturally grouped, none cropped, none overlapping faces.`;

  return [
    refTags,
    '',
    `Characters in this image (use the reference frames above to preserve facial features, costume, hair, and proportions of each one):\n${charactersList}`,
    '',
    `Scene: ${scene}`,
    '',
    `Composition: ${framing} ${orientation} format, cinematic framing, eye-level camera, shallow depth of field on the background.`,
    '',
    'Realism markers: photorealistic rendering, natural shadows, realistic skin and fabric textures, faithful to each reference (preserve facial features, costume colors, proportions). Each character recognizable. Not overly digitally perfect.',
    '',
    'Negative directives: no morphing between characters, no extra limbs, no distorted faces, no duplicated characters, no warped text, no spelling drift on names, no floating disembodied text outside the cake.',
  ].join('\n');
}

/**
 * Build the Veo prompt that animates the composite frame. Describes who
 * speaks, lip-sync directive, and ambient motion that matches the static
 * scene baked into the starting frame.
 */
export function buildVeoMotionPrompt(input: BuildVeoMotionPromptInput): string {
  const { characters, occasion, script } = input;
  if (characters.length === 0) {
    throw new Error('buildVeoMotionPrompt requires at least one character');
  }

  const speakerIdx = Math.min(Math.max(input.speakerIndex ?? 0, 0), characters.length - 1);
  const speaker = characters[speakerIdx];
  const others = characters.filter((_, i) => i !== speakerIdx);

  const speakerLine = `${speaker.name} (the character on ${speakerIdx === 0 ? 'the left' : speakerIdx === characters.length - 1 ? 'the right' : 'center'}) speaks the following lines naturally to the camera, with matching facial expressions and accurate lip-sync:`;

  const othersLine = others.length > 0
    ? `\n\nThe other character${others.length > 1 ? 's' : ''} (${others.map((c) => c.name).join(', ')}) listen${others.length > 1 ? '' : 's'} attentively, smiling, occasionally nodding or reacting warmly. They do NOT speak.`
    : '';

  const motion = getScene(occasion).motion;

  return [
    speakerLine,
    '',
    `"${script}"`,
    othersLine,
    '',
    `Ambient: ${motion}`,
    '',
    'Preserve all visual elements from the starting frame exactly — same characters, same costumes, same scene, same text on any visible objects. No new characters appear. No camera cuts.',
  ].join('');
}
