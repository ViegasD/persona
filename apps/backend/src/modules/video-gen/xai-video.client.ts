import { env } from '../../shared/config/env.js';
import { createChildLogger } from '../../shared/utils/logger.js';

const log = createChildLogger('xai-video-client');

// ─── Custom error ───────────────────────────────────────

export class XaiApiError extends Error {
  constructor(
    public readonly code: number | string,
    message: string,
  ) {
    super(message);
    this.name = 'XaiApiError';
  }
}

// ─── Request types ──────────────────────────────────────

export interface XaiVideoGenerateRequest {
  prompt: string;
  referenceImageUrls?: string[];  // up to 7 reference images
  imageUrl?: string;              // image-to-video mode (mutually exclusive with referenceImageUrls)
  duration?: number;              // 1-15 seconds (max 10 with reference images)
  aspectRatio?: string;           // "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "3:2" | "2:3"
  resolution?: '480p' | '720p';
}

// ─── Response types ─────────────────────────────────────

export type XaiVideoStatus = 'pending' | 'done' | 'expired' | 'failed';

export interface XaiSubmitResponse {
  request_id: string;
}

export interface XaiPollResponse {
  status: XaiVideoStatus;
  video?: {
    url: string;
    duration: number;
    respect_moderation: boolean;
  };
  model?: string;
}

// ─── Public types ───────────────────────────────────────

export interface XaiJobResponse {
  requestId: string;
  status: XaiVideoStatus;
}

export interface XaiResultResponse {
  requestId: string;
  status: XaiVideoStatus;
  videoUrl?: string;
  durationSeconds?: number;
  error?: string;
}

/**
 * Client for xAI Grok Imagine Video API.
 * Docs: https://docs.x.ai/developers/model-capabilities/video/generation
 */
export class XaiVideoClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = env.XAI_API_URL;
    this.apiKey = env.XAI_API_KEY ?? '';
  }

  private async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    log.debug({ method, url }, 'xAI request');

    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => 'unknown');
      log.error({ status: response.status, url, body: text }, 'xAI API error');
      throw new XaiApiError(
        response.status,
        `xAI error ${response.status}: ${text}`,
      );
    }

    return response.json() as Promise<T>;
  }

  /**
   * Submit a video generation request (reference-to-video mode).
   */
  async submitGeneration(params: XaiVideoGenerateRequest): Promise<XaiJobResponse> {
    const body: Record<string, unknown> = {
      model: 'grok-imagine-video',
      prompt: params.prompt,
      duration: params.duration ?? env.VIDEO_DURATION,
      aspect_ratio: params.aspectRatio ?? env.VIDEO_ASPECT_RATIO,
      resolution: params.resolution ?? env.VIDEO_RESOLUTION,
    };

    // Reference-to-video mode
    if (params.referenceImageUrls && params.referenceImageUrls.length > 0) {
      body.reference_image_urls = params.referenceImageUrls;
    }

    // Image-to-video mode
    if (params.imageUrl) {
      body.image_url = params.imageUrl;
    }

    const res = await this.request<XaiSubmitResponse>('POST', `${this.baseUrl}/videos/generations`, body);

    log.info({ requestId: res.request_id }, 'Video generation submitted to xAI');
    return { requestId: res.request_id, status: 'pending' };
  }

  /**
   * Poll the status of a video generation request.
   */
  async getStatus(requestId: string): Promise<XaiResultResponse> {
    const res = await this.request<XaiPollResponse>('GET', `${this.baseUrl}/videos/${requestId}`);

    return {
      requestId,
      status: res.status,
      videoUrl: res.video?.url,
      durationSeconds: res.video?.duration,
      error: res.status === 'failed' ? 'Video generation failed' : undefined,
    };
  }
}

export const xaiVideo = new XaiVideoClient();
