import { env } from '../../shared/config/env.js';
import { createChildLogger } from '../../shared/utils/logger.js';

const log = createChildLogger('veo-client');

// ─── Custom error ───────────────────────────────────────

export class VeoApiError extends Error {
  constructor(
    public readonly code: number | string,
    message: string,
  ) {
    super(message);
    this.name = 'VeoApiError';
  }
}

// ─── Public types ───────────────────────────────────────

export interface VeoGenerateRequest {
  prompt: string;
  /** Optional starting frame for image-to-video (base64 + mime). */
  imageBase64?: string;
  imageMimeType?: string;
  /** Veo 3.1 supports 4 / 6 / 8 second videos. */
  durationSeconds?: number;
  aspectRatio?: '16:9' | '9:16';
  resolution?: '720p' | '1080p';
  personGeneration?: 'allow_all' | 'allow_adult' | 'dont_allow';
}

export type VeoStatus = 'pending' | 'done' | 'failed';

export interface VeoJobResponse {
  /** Operation name returned by Veo (used for polling). */
  operationName: string;
  status: VeoStatus;
}

export interface VeoResultResponse {
  operationName: string;
  status: VeoStatus;
  /** URI of generated video — must be downloaded with the API key. */
  videoUri?: string;
  durationSeconds?: number;
  error?: string;
}

// ─── Wire types (Gemini API) ────────────────────────────

interface VeoOperationResponse {
  name: string;
  done?: boolean;
  error?: { code: number; message: string };
  response?: {
    generateVideoResponse?: {
      generatedSamples?: Array<{
        video?: { uri?: string };
      }>;
    };
  };
}

/**
 * Client for Google Veo (Gemini API).
 * Docs: https://ai.google.dev/gemini-api/docs/video
 */
export class VeoClient {
  private baseUrl: string;
  private apiKey: string;
  private model: string;

  constructor() {
    this.baseUrl = env.GOOGLE_API_URL;
    this.apiKey = env.GOOGLE_API_KEY ?? '';
    this.model = env.VEO_MODEL;
    if (!this.apiKey) {
      log.error('GOOGLE_API_KEY is not set — Veo calls will fail with 403');
    }
  }

  private headers(): Record<string, string> {
    if (!this.apiKey) {
      throw new VeoApiError('NO_API_KEY', 'GOOGLE_API_KEY env var is missing — set it in the deploy environment');
    }
    return {
      'x-goog-api-key': this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Submit a Veo video generation request. Returns the long-running
   * operation name to poll.
   */
  async submitGeneration(params: VeoGenerateRequest): Promise<VeoJobResponse> {
    const instance: Record<string, unknown> = { prompt: params.prompt };

    if (params.imageBase64 && params.imageMimeType) {
      instance.image = {
        bytesBase64Encoded: params.imageBase64,
        mimeType: params.imageMimeType,
      };
    }

    const body = {
      instances: [instance],
      parameters: {
        aspectRatio: params.aspectRatio ?? env.VIDEO_ASPECT_RATIO,
        durationSeconds: params.durationSeconds ?? env.VIDEO_DURATION,
        resolution: params.resolution ?? env.VIDEO_RESOLUTION,
        personGeneration: params.personGeneration ?? env.VIDEO_PERSON_GENERATION,
        sampleCount: 1,
      },
    };

    const url = `${this.baseUrl}/models/${this.model}:predictLongRunning`;
    log.debug({ url, promptLength: params.prompt.length, hasImage: !!instance.image }, 'Veo submit');

    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => 'unknown');
      log.error({ status: response.status, body: text }, 'Veo submit failed');
      throw new VeoApiError(response.status, `Veo submit error ${response.status}: ${text}`);
    }

    const data = (await response.json()) as { name?: string };
    if (!data.name) {
      throw new VeoApiError('NO_OPERATION', 'Veo did not return an operation name');
    }

    log.info({ operationName: data.name }, 'Veo generation submitted');
    return { operationName: data.name, status: 'pending' };
  }

  /**
   * Poll an operation. Returns 'pending' until done.
   */
  async getStatus(operationName: string): Promise<VeoResultResponse> {
    const url = `${this.baseUrl}/${operationName}`;
    const response = await fetch(url, { method: 'GET', headers: this.headers() });

    if (!response.ok) {
      const text = await response.text().catch(() => 'unknown');
      log.error({ status: response.status, operationName, body: text }, 'Veo poll failed');
      throw new VeoApiError(response.status, `Veo poll error ${response.status}: ${text}`);
    }

    const op = (await response.json()) as VeoOperationResponse;

    if (op.error) {
      return {
        operationName,
        status: 'failed',
        error: `Veo error ${op.error.code}: ${op.error.message}`,
      };
    }

    if (!op.done) {
      return { operationName, status: 'pending' };
    }

    const sample = op.response?.generateVideoResponse?.generatedSamples?.[0];
    const uri = sample?.video?.uri;

    if (!uri) {
      return {
        operationName,
        status: 'failed',
        error: 'Veo operation finished without a video URI',
      };
    }

    return {
      operationName,
      status: 'done',
      videoUri: uri,
    };
  }

  /**
   * Download a generated video file. The URI returned by Veo requires
   * authentication via the same API key.
   */
  async downloadVideo(uri: string): Promise<Buffer> {
    const response = await fetch(uri, {
      method: 'GET',
      headers: { 'x-goog-api-key': this.apiKey },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => 'unknown');
      throw new VeoApiError(response.status, `Veo download error ${response.status}: ${text}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }
}

export const veo = new VeoClient();
