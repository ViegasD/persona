import { env } from '../../shared/config/env.js';
import { createChildLogger } from '../../shared/utils/logger.js';

const log = createChildLogger('nano-banana-client');

// ─── Custom error ───────────────────────────────────────

export class NanoBananaApiError extends Error {
  constructor(
    public readonly code: number | string,
    message: string,
  ) {
    super(message);
    this.name = 'NanoBananaApiError';
  }
}

// ─── Public types ───────────────────────────────────────

export interface NanoBananaReferenceImage {
  base64: string;
  mimeType: string;
}

export interface NanoBananaGenerateRequest {
  prompt: string;
  /**
   * Reference images that the model will use as character/style anchors.
   * The model preserves face / costume / proportions of these references
   * when composing the new image.
   */
  referenceImages?: NanoBananaReferenceImage[];
  /** Optional aspect ratio hint embedded into the prompt. */
  aspectRatio?: '16:9' | '9:16' | '1:1';
}

export interface NanoBananaGenerateResponse {
  imageBase64: string;
  mimeType: string;
}

// ─── Wire types (Gemini API) ────────────────────────────

interface InlineDataPart {
  inlineData: {
    mimeType: string;
    data: string; // base64
  };
}

interface TextPart {
  text: string;
}

type Part = InlineDataPart | TextPart;

interface GenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Part[];
    };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { code: number; message: string };
}

/**
 * Client for Gemini 2.5 Flash Image ("Nano Banana") via the Gemini API.
 * Used to compose multi-character starting frames for Veo image-to-video.
 *
 * Docs: https://ai.google.dev/gemini-api/docs/image-generation
 */
export class NanoBananaClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor() {
    this.baseUrl = env.GOOGLE_API_URL;
    this.apiKey = env.GOOGLE_API_KEY ?? '';
    this.model = env.NANO_BANANA_MODEL;
    if (!this.apiKey) {
      log.error('GOOGLE_API_KEY is not set — Nano Banana / Veo calls will fail with 403');
    }
  }

  private headers(): Record<string, string> {
    if (!this.apiKey) {
      throw new NanoBananaApiError('NO_API_KEY', 'GOOGLE_API_KEY env var is missing — set it in the deploy environment');
    }
    return {
      'x-goog-api-key': this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Generate a single image from a text prompt + reference images.
   * Returns the first image part of the first candidate.
   */
  async generateComposite(params: NanoBananaGenerateRequest): Promise<NanoBananaGenerateResponse> {
    const parts: Part[] = [];

    // Reference images first — they anchor character identity.
    for (const ref of params.referenceImages ?? []) {
      parts.push({
        inlineData: { mimeType: ref.mimeType, data: ref.base64 },
      });
    }

    // Then the prompt text.
    parts.push({ text: params.prompt });

    const body = {
      contents: [{ role: 'user', parts }],
      // generationConfig.responseModalities tells the model we want an image back.
      generationConfig: {
        responseModalities: ['IMAGE'],
      },
    };

    const url = `${this.baseUrl}/models/${this.model}:generateContent`;
    log.debug(
      { url, promptLength: params.prompt.length, refs: params.referenceImages?.length ?? 0 },
      'Nano Banana submit',
    );

    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => 'unknown');
      log.error({ status: response.status, body: text }, 'Nano Banana submit failed');
      throw new NanoBananaApiError(
        response.status,
        `Nano Banana error ${response.status}: ${text}`,
      );
    }

    const data = (await response.json()) as GenerateContentResponse;

    if (data.error) {
      throw new NanoBananaApiError(
        data.error.code,
        `Nano Banana error ${data.error.code}: ${data.error.message}`,
      );
    }

    if (data.promptFeedback?.blockReason) {
      throw new NanoBananaApiError(
        'BLOCKED',
        `Nano Banana blocked: ${data.promptFeedback.blockReason}`,
      );
    }

    const candidateParts = data.candidates?.[0]?.content?.parts ?? [];
    const imagePart = candidateParts.find((p): p is InlineDataPart => 'inlineData' in p);

    if (!imagePart) {
      const finishReason = data.candidates?.[0]?.finishReason ?? 'unknown';
      throw new NanoBananaApiError(
        'NO_IMAGE',
        `Nano Banana returned no image (finishReason=${finishReason})`,
      );
    }

    return {
      imageBase64: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType,
    };
  }
}

export const nanoBanana = new NanoBananaClient();
