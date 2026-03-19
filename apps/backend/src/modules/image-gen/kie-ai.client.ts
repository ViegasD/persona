import { env } from '../../shared/config/env.js';
import { createChildLogger } from '../../shared/utils/logger.js';

const log = createChildLogger('kie-ai-client');

interface KieGenerateRequest {
  prompt: string;
  referenceImages: string[]; // URLs das imagens de referência
  numImages: number;
  width?: number;
  height?: number;
}

interface KieJobResponse {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
}

interface KieResultResponse {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  images?: Array<{
    url: string;
    seed?: number;
  }>;
  error?: string;
}

/**
 * Client para a API Kie.ai (Nano Banana 2 ou similar).
 *
 * NOTA: Os endpoints abaixo são baseados em padrões comuns de APIs de geração.
 * Ajuste conforme a documentação oficial do Kie.ai quando disponível.
 */
export class KieAiClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = env.KIE_API_URL;
    this.apiKey = env.KIE_API_KEY;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
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

    if (!response.ok) {
      const errorText = await response.text();
      log.error({ status: response.status, body: errorText, url }, 'Kie.ai API error');
      throw new Error(`Kie.ai error ${response.status}: ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Submete job de geração de imagens.
   */
  async submitGeneration(params: KieGenerateRequest): Promise<KieJobResponse> {
    return this.request<KieJobResponse>('POST', '/v1/generate', {
      prompt: params.prompt,
      reference_images: params.referenceImages,
      num_images: params.numImages,
      width: params.width ?? 1024,
      height: params.height ?? 1024,
      model: 'nano-banana-2',
    });
  }

  /**
   * Consulta status de um job de geração.
   */
  async getJobStatus(jobId: string): Promise<KieResultResponse> {
    return this.request<KieResultResponse>('GET', `/v1/jobs/${jobId}`);
  }

  /**
   * Cancela um job de geração.
   */
  async cancelJob(jobId: string): Promise<void> {
    await this.request('DELETE', `/v1/jobs/${jobId}`);
  }
}

export const kieApi = new KieAiClient();
