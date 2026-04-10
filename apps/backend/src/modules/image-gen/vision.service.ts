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

export type TemplateGender = 'MALE' | 'FEMALE' | 'UNISEX';

export interface VisionAnalysisResult {
  scenePrompt: string;
  tags: string[];
  gender: TemplateGender;
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

DYNAMIC PLACEHOLDERS — use these exact tokens when relevant (they will be replaced with real client data):
- {age} — the person's age (use for birthday candles, number balloons, age-related props: e.g. "blow out {age} candles")
- {profession} — the person's profession (use for professional/corporate scenes: e.g. "the composed stance of a working {profession}")
- {course} — graduation course name (use for graduation scenes: e.g. "completing {course}")
Only use a placeholder if the image content suggests that kind of detail (candles with a number → {age}, office setting → {profession}, cap and gown → {course}). Do NOT force placeholders where they don't fit.

TAGS: Also extract 5–10 single-word or hyphenated tags that describe the visual style (e.g. "vintage", "golden-hour", "indoor", "warm-tones", "minimalist", "urban", "bokeh", "film-grain", "casual", "formal").

GENDER DETECTION: Determine who this template is designed for based on the person visible in the image:
- "MALE" — the subject is clearly male (masculine clothing, build, features)
- "FEMALE" — the subject is clearly female (feminine clothing, build, features)
- "UNISEX" — no person visible, or the scene works equally for any gender (e.g. landscape-only, abstract, back-facing silhouette)

Respond ONLY with valid JSON:
{"scenePrompt": "...", "tags": ["...", "..."], "gender": "MALE|FEMALE|UNISEX"}`;

/**
 * Analyzes a template image using GPT-4o vision and generates a scene prompt + tags.
 * Accepts a base64 string (raw, no prefix) + mimeType OR a data URI.
 */
export async function analyzeTemplateImage(
  imageBase64: string,
  mimeType: string,
  occasionLabel: string,
): Promise<VisionAnalysisResult> {
  const startMs = Date.now();

  // Build data URI if not already one
  const dataUri = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:${mimeType};base64,${imageBase64}`;

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
            image_url: { url: dataUri, detail: 'high' },
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

    const validGenders: TemplateGender[] = ['MALE', 'FEMALE', 'UNISEX'];
    const rawGender = String(parsed.gender ?? '').toUpperCase() as TemplateGender;

    return {
      scenePrompt: parsed.scenePrompt.trim(),
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.map((t) => String(t).toLowerCase().trim()).filter(Boolean)
        : [],
      gender: validGenders.includes(rawGender) ? rawGender : 'UNISEX',
    };
  } catch (err) {
    log.error({ raw, err }, 'Failed to parse vision response — using raw text as prompt');
    return {
      scenePrompt: raw.substring(0, 500),
      tags: [],
      gender: 'UNISEX',
    };
  }
}

/**
 * Detects gender from a client selfie using GPT-4o vision.
 * Returns 'male' | 'female' | null (null if uncertain / no person visible).
 */
export async function detectGenderFromPhoto(
  imageBase64: string,
  mimeType: string,
): Promise<'male' | 'female' | null> {
  const dataUri = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:${mimeType};base64,${imageBase64}`;

  try {
    const completion = await getVisionClient().chat.completions.create({
      model: env.OPENAI_VISION_MODEL,
      messages: [
        {
          role: 'system',
          content: `You analyze photos to determine the apparent gender of the person for a photography service. Respond ONLY with valid JSON: {"gender": "male"} or {"gender": "female"} or {"gender": null} if you cannot determine.`,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is the apparent gender of the person in this photo?' },
            { type: 'image_url', image_url: { url: dataUri, detail: 'low' } },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 50,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? '';
    const parsed = JSON.parse(raw);
    const g = parsed.gender;
    if (g === 'male' || g === 'female') return g;
    return null;
  } catch (err) {
    log.warn({ err }, 'Gender detection failed — returning null');
    return null;
  }
}
