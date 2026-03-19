import { createChildLogger } from '../../shared/utils/logger.js';
import { getOccasionPromptHint } from '../funnel/packages.config.js';

const log = createChildLogger('prompt-engine');

export interface PromptParams {
  occasion: string;
  occasionDetails?: string;
  additionalNotes?: string;
}

/**
 * Motor de composição de prompts para geração de imagens fotográficas.
 * Usa ocasião (aniversário, profissional, etc.) em vez de estilo/cenário fixo.
 */

const BASE_QUALITY =
  'photorealistic, professional photography, shot with Canon EOS R5 85mm f/1.4, ' +
  'sharp focus, high resolution, 8K UHD, RAW photo quality, natural skin texture, ' +
  'professional color grading, detailed lighting';

const NEGATIVE_PROMPT =
  'cartoon, illustration, anime, drawing, painting, sketch, CGI, 3D render, ' +
  'deformed, distorted, disfigured, bad anatomy, extra limbs, blurry, low quality, ' +
  'watermark, text, logo, oversaturated';

/**
 * Gera o prompt completo para a Kie.ai API baseado na ocasião.
 */
export function buildPrompt(params: PromptParams): { prompt: string; negativePrompt: string } {
  const occasionHint = getOccasionPromptHint(params.occasion);

  const parts = [
    'Professional photographic portrait of a person maintaining exact facial identity from reference images',
    occasionHint,
    BASE_QUALITY,
  ];

  if (params.occasionDetails) {
    parts.push(params.occasionDetails);
  }

  if (params.additionalNotes) {
    parts.push(params.additionalNotes);
  }

  const prompt = parts.join(', ');

  log.debug({ occasion: params.occasion, promptLength: prompt.length }, 'Prompt gerado');

  return { prompt, negativePrompt: NEGATIVE_PROMPT };
}

/**
 * Gera variações do prompt base para criar diversidade no batch.
 */
export function buildPromptVariations(
  params: PromptParams,
  count: number,
): Array<{ prompt: string; negativePrompt: string }> {
  const base = buildPrompt(params);

  const variations = [
    '', // Original
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
  ];

  return Array.from({ length: count }, (_, i) => ({
    prompt: base.prompt + (variations[i % variations.length] ?? ''),
    negativePrompt: base.negativePrompt,
  }));
}
