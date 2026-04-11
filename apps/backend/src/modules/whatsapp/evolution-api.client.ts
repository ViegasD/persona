import { env } from '../../shared/config/env.js';
import { createChildLogger } from '../../shared/utils/logger.js';

const log = createChildLogger('evolution-api');

interface EvolutionResponse<T = unknown> {
  data: T;
  status: number;
}

/**
 * Client HTTP para a Evolution API v2.3.7.
 * Referência: EVOLUTION_API_V2.3.7_REFERENCE.md
 */
export class EvolutionApiClient {
  private baseUrl: string;
  private apiKey: string;
  private instanceName: string;

  constructor() {
    this.baseUrl = env.EVOLUTION_API_URL;
    this.apiKey = env.EVOLUTION_API_KEY;
    this.instanceName = env.EVOLUTION_INSTANCE_NAME;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    log.debug({ method, url }, 'Evolution API request');

    const response = await fetch(url, {
      method,
      headers: {
        'apikey': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error({ status: response.status, body: errorText, url }, 'Evolution API error');
      throw new Error(`Evolution API error ${response.status}: ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  // ─── Send Messages ────────────────────────────────────────

  /**
   * POST /message/sendText/{instanceName}
   */
  async sendText(
    number: string,
    text: string,
    options?: { delay?: number; linkPreview?: boolean },
  ) {
    return this.request('POST', `/message/sendText/${this.instanceName}`, {
      number,
      text,
      delay: options?.delay ?? 0,
      linkPreview: options?.linkPreview ?? false,
    });
  }

  /**
   * POST /message/sendMedia/{instanceName}
   */
  async sendMedia(
    number: string,
    mediaUrl: string,
    options: {
      mediatype: 'image' | 'video' | 'document';
      mimetype: string;
      caption?: string;
      fileName?: string;
      delay?: number;
    },
  ) {
    return this.request('POST', `/message/sendMedia/${this.instanceName}`, {
      number,
      media: mediaUrl,
      mediatype: options.mediatype,
      mimetype: options.mimetype,
      caption: options.caption,
      fileName: options.fileName,
      delay: options.delay ?? 0,
    });
  }

  /**
   * POST /message/sendReaction/{instanceName}
   */
  async sendReaction(
    remoteJid: string,
    messageId: string,
    reaction: string,
    fromMe: boolean,
  ) {
    return this.request('POST', `/message/sendReaction/${this.instanceName}`, {
      reactionMessage: {
        key: {
          remoteJid,
          fromMe,
          id: messageId,
        },
        reaction,
      },
    });
  }

  // ─── Media ────────────────────────────────────────────────

  /**
   * POST /chat/getBase64FromMediaMessage/{instanceName}
   */
  async getMediaBase64(
    remoteJid: string,
    messageId: string,
    fromMe: boolean,
  ): Promise<{ base64: string; mimetype: string; fileName: string }> {
    return this.request('POST', `/chat/getBase64FromMediaMessage/${this.instanceName}`, {
      message: {
        key: {
          remoteJid,
          fromMe,
          id: messageId,
        },
      },
      convertToMp4: false,
    });
  }

  // ─── Instance Management ──────────────────────────────────

  /**
   * GET /instance/connectionState/{instanceName}
   */
  async getConnectionState(): Promise<{ instance: string; state: string }> {
    return this.request('GET', `/instance/connectionState/${this.instanceName}`);
  }

  /**
   * POST /instance/setPresence/{instanceName}
   */
  async setPresence(presence: 'available' | 'unavailable') {
    return this.request('POST', `/instance/setPresence/${this.instanceName}`, {
      presence,
    });
  }

  // ─── Chat Operations ─────────────────────────────────────

  /**
   * POST /chat/markChatAsRead/{instanceName}
   */
  async markAsRead(remoteJid: string) {
    return this.request('POST', `/chat/markChatAsRead/${this.instanceName}`, {
      remoteJid,
    });
  }

  // ─── Contact ──────────────────────────────────────────────

  /**
   * GET /contact/checkWhatsApp/{instanceName}
   */
  async checkWhatsApp(numbers: string[]): Promise<Array<{ number: string; exists: boolean; jid?: string }>> {
    const query = numbers.join(',');
    return this.request('GET', `/contact/checkWhatsApp/${this.instanceName}?numbers=${query}`);
  }
}

export const evolutionApi = new EvolutionApiClient();
