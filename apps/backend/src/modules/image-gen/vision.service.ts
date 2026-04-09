import OpenAI from 'openai';
import { env } from '../../shared/config/env.js';
import { createChildLogger } from '../../shared/utils/logger.js';

const log = createChildLogger('vision-service');

let visionClient: OpenAI | null = null;

function getVisionClient(): OpenAI {
  if (!visionClient) {
    visionClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return visionClient;
}

export interface VisionAnalysisResult {
  scenePrompt: string;
  tags: string[];
}

const VISION_SYSTEM_PROMPT = `You are an expert photography scene descriptor for an AI portrait generation system.

Given a reference photograph and its occasion category, write a SINGLE scene description that could be used as a prompt to recreate the mood, setting, lighting, and style of this photograph with a different person.

FORMAT: Write a continuous sentence (60–120 words) describing:
- Environment/location with specific real-world details
- Lighting quality, direction, and color temperature
- Wardrobe/clothing style visible
- Props, furniture, or objects present
- Camera angle and framing
- Mood and expression style
- Any distinctive visual quality (film grain, warm tones, soft focus, etc.)

RULES:
- Write in English, present tense, as if directing a photographer
- NEVER use: "photorealistic", "ultra detailed", "8K", "4K", "HDR", "beautiful", "flawless", "perfect", "stunning", "gorgeous", "studio lighting", "dramatic lighting", "highly detailed"
- Use specific grounded descriptions instead of superlatives
- Include natural imperfections (flyaway hair, slight wrinkles, uneven lighting)
- Do NOT describe the person's identity, race, or specific facial features — only describe what they're DOING, WEARING, and the SETTING around them

TAGS: Also extract 5–10 single-word or hyphenated tags that describe the visual style (e.g. "vintage", "golden-hour", "indoor", "warm-tones", "minimalist", "urban", "bokeh", "film-grain", "casual", "formal").

Respond ONLY with valid JSON:
{"scenePrompt": "...", "tags": ["...", "..."]}`;

/**
 * Analyzes a template image using GPT-4o vision and generates a scene prompt + tags.
 * The scene prompt is written in the same format as SCENE_PACKS entries.
 */
export async function analyzeTemplateImage(
  imageUrl: string,
  occasionLabel: string,
): Promise<VisionAnalysisResult> {
  const startMs = Date.now();

  const completion = await getVisionClient().chat.completions.create({
    model: env.OPENAI_VISION_MODEL,
    messages: [
      { role: 'system', content: VISION_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Occasion category: "${occasionLabel}". Describe this photograph as a scene prompt:`,
          },
          {
            type: 'image_url',
            image_url: { url: imageUrl, detail: 'high' },
          },
        ],
      },
    ],
    temperature: 0.4,
    max_tokens: 500,
    response_format: { type: 'json_object' },
  });

  const raw = completion.choices[0]?.message?.content?.trim() ?? '';
  const durationMs = Date.now() - startMs;
  const tokens = completion.usage?.total_tokens ?? 0;

  log.info(
    { model: env.OPENAI_VISION_MODEL, tokens, durationMs, occasionLabel },
    'Vision analysis completed',
  );

  try {
    const parsed = JSON.parse(raw) as VisionAnalysisResult;

    if (!parsed.scenePrompt || typeof parsed.scenePrompt !== 'string') {
      throw new Error('Missing scenePrompt in vision response');
    }

    return {
      scenePrompt: parsed.scenePrompt.trim(),
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.map((t) => String(t).toLowerCase().trim()).filter(Boolean)
        : [],
    };
  } catch (err) {
    log.error({ raw, err }, 'Failed to parse vision response — using raw text as prompt');
    return {
      scenePrompt: raw.substring(0, 500),
      tags: [],
    };
  }
}
