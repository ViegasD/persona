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
 * Motor de composição de prompts para geração de imagens fotográficas.
 * Usa ocasião (aniversário, profissional, etc.) em vez de estilo/cenário fixo.
 */

const BASE_QUALITY =
  'photorealistic, professional photography, shot with Canon EOS R5 85mm f/1.4, ' +
  'sharp focus, high resolution, 8K UHD, RAW photo quality, natural skin texture, ' +
  'professional color grading, detailed lighting';

const NEGATIVE_BASE =
  'cartoon, illustration, anime, drawing, painting, sketch, CGI, 3D render, ' +
  'deformed, distorted, disfigured, bad anatomy, extra limbs, blurry, low quality, ' +
  'watermark, text, logo, oversaturated';

const NEGATIVE_EXTRA_PEOPLE =
  'other people, strangers, extra faces, bystanders, crowd, multiple persons, background people';

const NEGATIVE_EXTRA_PEOPLE_COUPLE =
  'strangers, bystanders, crowd, extra people beyond the couple, third person';

/**
 * Builds a rich occasion-specific scene description using structured details.
 */
function buildOccasionContext(params: PromptParams): string {
  const { occasion, ageAtBirthday, profession, graduationCourse, occasionDetails } = params;
  const occ = occasion.toLowerCase().trim();

  switch (occ) {
    case 'aniversario': {
      const age = ageAtBirthday?.replace(/\D/g, '') ?? '';
      const ageTag = age ? `${age}-year-old, ` : '';
      const numberDecor = age ? `balloons and decorations with the number ${age}, birthday cake with ${age} candles, ` : 'birthday balloons and cake, ';
      return `birthday celebration for a ${ageTag}person, ${numberDecor}festive party setting, colorful confetti, warm celebratory lighting`;
    }
    case 'profissional': {
      const prof = profession ?? occasionDetails ?? 'professional';
      return `professional portrait of a ${prof}, appropriate ${prof} work environment, professional business attire fitting for a ${prof}, clean modern background, confident executive look`;
    }
    case 'formatura': {
      const course = graduationCourse ?? occasionDetails ?? 'graduation';
      return `${course} school graduation ceremony, academic cap and gown for ${course}, diploma in hand, ${course} faculty setting, proud graduation moment`;
    }
    case 'casal':
      return 'romantic couple portrait, two people in love, warm intimate mood, soft natural lighting, elegant setting';
    case 'gravidez':
      return 'maternity photography, gentle elegant pose, flowing dress, soft diffused lighting, baby bump, serene mood';
    case 'familia':
      return 'family portrait, warm joyful expressions, soft natural lighting, harmonious group composition';
    case 'infantil':
      return 'children photography, playful colorful setting, joyful expressions, bright cheerful lighting';
    case 'fitness':
      return 'fitness photography, athletic confident pose, gym or outdoor workout setting, dynamic energetic lighting';
    case 'natalino':
      return 'Christmas themed portrait, festive holiday decorations, red and green colors, warm cozy lighting';
    case 'debutante':
      return 'debutante ball portrait, elegant formal gown, glamorous chandeliered setting, soft romantic lighting';
    case 'pet':
      return 'portrait with pet, heartwarming bond between owner and pet, natural warm lighting';
    default:
      return `${occasion} themed photography, natural setting, flattering light`;
  }
}

/**
 * Gera o prompt completo para a Kie.ai API baseado na ocasião.
 */
export function buildPrompt(params: PromptParams): { prompt: string; negativePrompt: string } {
  const occasionContext = buildOccasionContext(params);

  const parts: string[] = [];

  // Style template instruction — must come first for model attention
  if (params.hasStyleTemplate) {
    parts.push(
      '[REFERENCE GUIDE: Earlier images show the person — preserve their exact face and identity. ' +
      'The LAST image is a STYLE REFERENCE only — copy its lighting, color grade, background mood and scene aesthetic. ' +
      'Do NOT copy the pose or any people from the style reference. Generate a unique natural pose for the subject.]',
    );
  }

  parts.push(
    'Professional photographic portrait of a person maintaining exact facial identity from reference images',
    occasionContext,
    BASE_QUALITY,
  );

  if (params.occasionDetails) {
    parts.push(params.occasionDetails);
  }

  if (params.additionalNotes) {
    parts.push(params.additionalNotes);
  }

  const prompt = parts.join(', ');

  const negativePrompt = params.isCoupleShot
    ? `${NEGATIVE_BASE}, ${NEGATIVE_EXTRA_PEOPLE_COUPLE}`
    : `${NEGATIVE_BASE}, ${NEGATIVE_EXTRA_PEOPLE}`;

  log.debug({ occasion: params.occasion, promptLength: prompt.length, hasStyleTemplate: params.hasStyleTemplate }, 'Prompt gerado');

  return { prompt, negativePrompt };
}

/**
 * Occasion-specific pose variation suffixes to add diversity across the batch.
 */
const VARIATIONS_BY_OCCASION: Record<string, string[]> = {
  aniversario: [
    '',
    ', blowing birthday candles, joyful expression',
    ', holding a slice of birthday cake, smiling',
    ', laughing surrounded by balloons',
    ', looking at camera with birthday crown',
    ', candid celebration moment',
  ],
  profissional: [
    '',
    ', confident arms-crossed pose',
    ', looking slightly to the side, three-quarter view',
    ', seated at desk, professional environment',
    ', close-up headshot, direct eye contact',
    ', standing in office environment',
  ],
  formatura: [
    '',
    ', throwing graduation cap in the air',
    ', holding diploma, proud expression',
    ', close-up portrait with academic cap',
    ', full body graduation gown shot',
    ', candid celebration with diploma',
  ],
  default: [
    '',
    ', slight smile, warm expression',
    ', looking slightly to the side, three-quarter view',
    ', full body shot, confident stance',
    ', close-up portrait, intense eye contact',
    ', candid moment, natural movement',
    ', looking away, profile view, contemplative',
    ', wide shot, environmental portrait',
    ', backlit silhouette edge, dramatic contrast',
    ', low angle, powerful perspective',
    ', high angle, gentle look downward',
    ', laughing naturally, joyful expression',
  ],
};

/**
 * Gera variações do prompt base para criar diversidade no batch.
 * Cada variação recebe um sufixo de pose distinto para a ocasião.
 */
export function buildPromptVariations(
  params: PromptParams,
  count: number,
): Array<{ prompt: string; negativePrompt: string }> {
  const base = buildPrompt(params);
  const occ = params.occasion.toLowerCase().trim();
  const variations = VARIATIONS_BY_OCCASION[occ] ?? VARIATIONS_BY_OCCASION.default;

  return Array.from({ length: count }, (_, i) => ({
    prompt: base.prompt + (variations[i % variations.length] ?? ''),
    negativePrompt: base.negativePrompt,
  }));
}
