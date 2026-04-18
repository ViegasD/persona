import { createChildLogger } from '../../shared/utils/logger.js';

const log = createChildLogger('video-prompt-engine');

export interface VideoPromptParams {
  characterName: string;
  characterPersonality?: string; // prompt hint from Character model
  messageType: string;           // "aniversario", "parabens", "motivacao", etc.
  recipientName: string;
  recipientAge?: string;
  customMessage?: string;
  referenceImageCount: number;   // how many <IMAGE_N> placeholders to use
}

/**
 * Scene packs for video generation — each entry is a visual scenario prompt.
 * Uses <IMAGE_1>, <IMAGE_2>, etc. to reference character catalog images.
 */
const VIDEO_SCENE_PACKS: Record<string, string[]> = {
  aniversario: [
    'The character from <IMAGE_1> is in a festive room decorated with colorful balloons and streamers. They look directly at the camera with a warm, genuine smile and wave enthusiastically. The room has warm ambient lighting with party decorations. They gesture happily as if wishing someone a birthday. Joyful, celebratory atmosphere. High quality, natural motion.',
    'The character from <IMAGE_1> stands in front of a beautiful birthday cake with lit candles. Party decorations fill the background. They clap their hands with excitement and give a big thumbs up to the camera. Warm golden lighting, confetti particles floating in the air. Genuine happiness and celebration.',
    'The character from <IMAGE_1> holds a wrapped birthday gift and extends it toward the camera with both hands, then pulls it back and gives an excited wave. Colorful party backdrop with bunting and balloons. Warm, inviting lighting. Playful, generous gesture.',
  ],
  parabens: [
    'The character from <IMAGE_1> is in a bright, cheerful setting. They look at the camera and clap their hands together enthusiastically, then give a big double thumbs up. Warm natural lighting, clean background with subtle decorative elements. Genuine congratulatory energy. High quality, smooth motion.',
    'The character from <IMAGE_1> stands in an elegant setting and raises both arms in a celebratory gesture, then brings hands together in an applause motion. Warm side lighting, professional but warm atmosphere. Pride and joy in their expression.',
  ],
  motivacao: [
    'The character from <IMAGE_1> is in a clean, professional setting. They look directly at the camera with a confident, encouraging expression and give a strong thumbs up. Then they point at the camera as if saying "you can do it". Natural lighting, motivational energy. Steady, confident movements.',
    'The character from <IMAGE_1> sits in a well-lit room and speaks passionately toward the camera with animated hand gestures. They nod affirmingly and place a hand over their heart. Warm, natural light from a window. Sincere, motivational tone.',
  ],
  natal: [
    'The character from <IMAGE_1> is in a cozy room decorated for Christmas with a tree, warm lights, and ornaments. They wave at the camera warmly and blow a kiss. Twinkling fairy lights in the background, warm amber glow. Cozy holiday atmosphere. Gentle, affectionate movements.',
    'The character from <IMAGE_1> holds a small wrapped Christmas gift near a decorated tree. They show the gift to the camera and give a warm smile and wave. Red and gold holiday decorations, soft warm lighting. Festive, generous spirit.',
  ],
  'dia-das-maes': [
    'The character from <IMAGE_1> is in a bright, warm room with flowers in the background. They hold a bouquet of roses and present them toward the camera with a tender smile. They then place a hand over their heart. Soft, warm natural lighting. Deep affection and gratitude in their expression.',
    'The character from <IMAGE_1> sits in a sunlit garden and looks at the camera with a loving expression. They blow a gentle kiss and wave. Flowers and greenery in soft focus behind them. Golden hour lighting. Tender, heartfelt moment.',
  ],
  default: [
    'The character from <IMAGE_1> is in a well-lit, clean setting. They look directly at the camera with a warm, friendly expression and wave. Natural movements, genuine emotion. High quality, smooth cinematic motion. Subtle ambient lighting.',
    'The character from <IMAGE_1> stands in an elegant but casual setting. They smile warmly at the camera and give an enthusiastic thumbs up, then wave. Clean background, natural lighting. Approachable, genuine energy.',
  ],
};

/**
 * Build a video prompt for xAI Grok Imagine Video (reference-to-video mode).
 */
export function buildVideoPrompt(params: VideoPromptParams, sceneIndex?: number): string {
  const parts: string[] = [];

  // 1. Pick a scene from the pack
  const messageType = params.messageType.toLowerCase().trim();
  const pack = VIDEO_SCENE_PACKS[messageType] ?? VIDEO_SCENE_PACKS.default;
  const idx = sceneIndex !== undefined ? sceneIndex % pack.length : Math.floor(Math.random() * pack.length);
  let scene = pack[idx];

  // Replace <IMAGE_N> references beyond what we have
  for (let i = params.referenceImageCount + 1; i <= 7; i++) {
    scene = scene.replace(new RegExp(`<IMAGE_${i}>`, 'g'), '<IMAGE_1>');
  }

  parts.push(scene);

  // 2. Character personality hint
  if (params.characterPersonality) {
    parts.push(`The character's personality: ${params.characterPersonality}.`);
  }

  // 3. Message context
  if (params.messageType === 'aniversario' && params.recipientAge) {
    parts.push(`This is a birthday greeting for ${params.recipientName} who is turning ${params.recipientAge}.`);
  } else if (params.recipientName) {
    parts.push(`This is a special message for ${params.recipientName}.`);
  }

  // 4. Custom message context
  if (params.customMessage) {
    parts.push(`The mood and tone should convey: ${params.customMessage}.`);
  }

  const prompt = parts.join(' ');
  log.debug({ messageType, promptLength: prompt.length, sceneIndex: idx }, 'Video prompt generated');
  return prompt;
}

/**
 * Build multiple prompt variations for batch generation.
 */
export function buildVideoPromptVariations(params: VideoPromptParams, count: number): string[] {
  return Array.from({ length: count }, (_, i) => buildVideoPrompt(params, i));
}
