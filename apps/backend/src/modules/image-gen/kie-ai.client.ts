import { env } from '../../shared/config/env.js';
import { createChildLogger } from '../../shared/utils/logger.js';

const log = createChildLogger('kie-ai-client');

// ─── Custom error ───────────────────────────────────────

/**
 * Thrown when Kie.ai returns a known API error code.
 * Use `error.code` to distinguish recoverable vs unrecoverable failures.
 *   402 = insufficient credits (unrecoverable until admin tops up)
 *   429 = rate limited (transient, retry)
 *   5xx = server error (transient, retry)
 */
export class KieApiError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = 'KieApiError';
  }
}

// ─── Request types ──────────────────────────────────────

interface KieGenerateRequest {
  prompt: string;
  referenceImages: string[]; // URLs das imagens de referência (max 14)
  aspectRatio?: string;
  resolution?: string;
  outputFormat?: string;
}

// ─── API response types ─────────────────────────────────

interface KieApiResponse<T> {
  code: number;
  msg: string;
  data: T;
}

interface KieCreateTaskData {
  taskId: string;
}

interface KieTaskDetailData {
  taskId: string;
  model: string;
  state: 'waiting' | 'queuing' | 'generating' | 'success' | 'fail';
  resultJson?: string; // JSON string: { resultUrls: string[] }
  failCode?: string;
  failMsg?: string;
  costTime?: number;
}

// ─── Public types ───────────────────────────────────────

export interface KieJobResponse {
  taskId: string;
  state: KieTaskDetailData['state'];
}

export interface KieResultResponse {
  taskId: string;
  state: KieTaskDetailData['state'];
  imageUrls: string[];
  error?: string;
}

/**
 * Client para a API Kie.ai — endpoints Unified Market API.
 * Docs: https://docs.kie.ai/market/quickstart
 */
export class KieAiClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = env.KIE_API_URL;
    this.apiKey = env.KIE_API_KEY;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<KieApiResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    log.debug({ method, url }, 'Kie.ai request');

    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const json = await response.json() as KieApiResponse<T>;

    if (!response.ok || (json.code && json.code !== 200)) {
      log.error({ status: response.status, code: json.code, msg: json.msg, url }, 'Kie.ai API error');
      throw new KieApiError(
        json.code ?? response.status,
        `Kie.ai error ${json.code ?? response.status}: ${json.msg ?? 'unknown'}`,
      );
    }

    return json;
  }

  /**
   * Submete job de geração de imagem (1 imagem por chamada).
   */
  async submitGeneration(params: KieGenerateRequest): Promise<KieJobResponse> {
    const res = await this.request<KieCreateTaskData>('POST', '/api/v1/jobs/createTask', {
      model: 'nano-banana-2',
      input: {
        prompt: params.prompt,
        image_input: params.referenceImages,
        aspect_ratio: params.aspectRatio ?? '1:1',
        resolution: params.resolution ?? '2K',
        output_format: params.outputFormat ?? 'png',
      },
    });

    log.info({ taskId: res.data.taskId }, 'Task criada no Kie.ai');
    return { taskId: res.data.taskId, state: 'waiting' };
  }

  /**
   * Submete upscale via Topaz.
   */
  async submitTopazUpscale(imageUrl: string, upscaleFactor: string = '2'): Promise<KieJobResponse> {
    const res = await this.request<KieCreateTaskData>('POST', '/api/v1/jobs/createTask', {
      model: 'topaz/image-upscale',
      input: {
        image_url: imageUrl,
        upscale_factor: upscaleFactor,
      },
    });

    log.info({ taskId: res.data.taskId }, 'Topaz upscale task criada no Kie.ai');
    return { taskId: res.data.taskId, state: 'waiting' };
  }

  /**
   * Submete upscale via Recraft Crisp.
   */
  async submitCrispUpscale(imageUrl: string): Promise<KieJobResponse> {
    const res = await this.request<KieCreateTaskData>('POST', '/api/v1/jobs/createTask', {
      model: 'recraft/crisp-upscale',
      input: {
        image: imageUrl,
      },
    });

    log.info({ taskId: res.data.taskId }, 'Crisp upscale task criada no Kie.ai');
    return { taskId: res.data.taskId, state: 'waiting' };
  }

  /**
   * Consulta status de uma task.
   */
  async getTaskStatus(taskId: string): Promise<KieResultResponse> {
    const res = await this.request<KieTaskDetailData>('GET', `/api/v1/jobs/recordInfo?taskId=${taskId}`);
    const data = res.data;

    let imageUrls: string[] = [];
    if (data.state === 'success' && data.resultJson) {
      try {
        const result = JSON.parse(data.resultJson) as { resultUrls?: string[] };
        imageUrls = result.resultUrls ?? [];
      } catch {
        log.warn({ taskId, resultJson: data.resultJson }, 'Failed to parse resultJson');
      }
    }

    return {
      taskId: data.taskId,
      state: data.state,
      imageUrls,
      error: data.failMsg || undefined,
    };
  }
}

export const kieApi = new KieAiClient();
