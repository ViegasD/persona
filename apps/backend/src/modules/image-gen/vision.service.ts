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
export type TemplateExpression = 'SMILING' | 'NEUTRAL' | 'ANY';

export interface VisionAnalysisResult {
  scenePrompt: string;
  tags: string[];
  gender: TemplateGender;
  expression: TemplateExpression;
}

export interface FaceAttributes {
  gender: 'male' | 'female' | null;
  smile: 'smiling' | 'neutral' | null;
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

EXPRESSION DETECTION: Determine the facial expression of the person in the template:
- "SMILING" — the subject is visibly smiling (teeth showing, clear smile, happy expression)
- "NEUTRAL" — the subject has a neutral, serious, contemplative, or composed expression (no smile)
- "ANY" — no person visible, face not clearly visible, or expression is ambiguous

Respond ONLY with valid JSON:
{"scenePrompt": "...", "tags": ["...", "..."], "gender": "MALE|FEMALE|UNISEX", "expression": "SMILING|NEUTRAL|ANY"}`;

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
    const validExpressions: TemplateExpression[] = ['SMILING', 'NEUTRAL', 'ANY'];
    const rawExpression = String((parsed as any).expression ?? '').toUpperCase() as TemplateExpression;

    return {
      scenePrompt: parsed.scenePrompt.trim(),
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.map((t) => String(t).toLowerCase().trim()).filter(Boolean)
        : [],
      gender: validGenders.includes(rawGender) ? rawGender : 'UNISEX',
      expression: validExpressions.includes(rawExpression) ? rawExpression : 'ANY',
    };
  } catch (err) {
    log.error({ raw, err }, 'Failed to parse vision response — using raw text as prompt');
    return {
      scenePrompt: raw.substring(0, 500),
      tags: [],
      gender: 'UNISEX',
      expression: 'ANY',
    };
  }
}

/**
 * Detects gender and smile expression from a client selfie using GPT-4o vision.
 * Combined into a single API call to save tokens and latency.
 */
export async function detectFaceAttributes(
  imageBase64: string,
  mimeType: string,
): Promise<FaceAttributes> {
  const dataUri = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:${mimeType};base64,${imageBase64}`;

  try {
    const completion = await getVisionClient().chat.completions.create({
      model: env.OPENAI_VISION_MODEL,
      messages: [
        {
          role: 'system',
          content: `You analyze photos for a photography service. Determine two things about the person:\n1. Apparent gender: "male" or "female" (or null if uncertain)\n2. Expression: "smiling" (visible smile, teeth showing, happy) or "neutral" (no smile, serious, composed) (or null if uncertain)\n\nRespond ONLY with valid JSON: {"gender": "male"|"female"|null, "smile": "smiling"|"neutral"|null}`,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze the person in this photo:' },
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
    const s = parsed.smile;
    return {
      gender: (g === 'male' || g === 'female') ? g : null,
      smile: (s === 'smiling' || s === 'neutral') ? s : null,
    };
  } catch (err) {
    log.warn({ err }, 'Face attribute detection failed — returning nulls');
    return { gender: null, smile: null };
  }
}
