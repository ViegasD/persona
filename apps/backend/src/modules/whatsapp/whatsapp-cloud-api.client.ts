import { env } from '../../shared/config/env.js';
import { createChildLogger } from '../../shared/utils/logger.js';

const log = createChildLogger('whatsapp-cloud-api');

const GRAPH_API_BASE = 'https://graph.facebook.com/v25.0';

/**
 * HTTP client for the WhatsApp Cloud API (Meta official).
 * Sends messages via POST /{Phone-Number-ID}/messages.
 */
export class WhatsAppCloudApiClient {
  private token: string;
  private phoneNumberId: string;

  constructor() {
    if (!env.WA_CLOUD_API_TOKEN || !env.WA_PHONE_NUMBER_ID) {
      throw new Error('WA_CLOUD_API_TOKEN and WA_PHONE_NUMBER_ID must be set to use WhatsApp Cloud API');
    }
    this.token = env.WA_CLOUD_API_TOKEN;
    this.phoneNumberId = env.WA_PHONE_NUMBER_ID;
  }

  private get messagesUrl(): string {
    return `${GRAPH_API_BASE}/${this.phoneNumberId}/messages`;
  }

  private async request(body: Record<string, unknown>): Promise<unknown> {
    const response = await fetch(this.messagesUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error({ status: response.status, body: errorText }, 'Cloud API error');
      throw new Error(`WhatsApp Cloud API error ${response.status}: ${errorText}`);
    }

    return response.json();
  }

  /**
   * Send a text message.
   * @param to — E.164 phone number (e.g. "5511999999999")
   * @param body — message text
   */
  async sendText(to: string, body: string): Promise<void> {
    log.debug({ to, bodyLen: body.length }, 'Sending text via Cloud API');
    await this.request({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    });
  }

  /**
   * Send an image via image.link (URL must be HTTPS and under 5 MB).
   * Kie.ai CDN URLs are HTTPS — use them directly.
   */
  async sendImage(to: string, imageUrl: string, caption?: string): Promise<void> {
    log.debug({ to, imageUrl, caption }, 'Sending image via Cloud API (image.link)');
    await this.request({
      messaging_product: 'whatsapp',
      to,
      type: 'image',
      image: {
        link: imageUrl,
        ...(caption ? { caption } : {}),
      },
    });
  }

  /**
   * Send a document via document.link (preserves original quality — no WhatsApp compression).
   */
  async sendDocument(to: string, documentUrl: string, caption?: string, fileName?: string): Promise<void> {
    log.debug({ to, documentUrl, caption, fileName }, 'Sending document via Cloud API');
    await this.request({
      messaging_product: 'whatsapp',
      to,
      type: 'document',
      document: {
        link: documentUrl,
        ...(caption ? { caption } : {}),
        ...(fileName ? { filename: fileName } : {}),
      },
    });
  }

  /**
   * Mark a message as read.
   */
  async markRead(messageId: string): Promise<void> {
    log.debug({ messageId }, 'Marking message as read via Cloud API');
    await this.request({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    });
  }

  /**
   * Mark a message as read AND show typing indicator (the "..." bubble).
   * The typing bubble is dismissed when you send a response, or after 25 seconds.
   */
  async showTypingIndicator(messageId: string): Promise<void> {
    log.debug({ messageId }, 'Showing typing indicator via Cloud API');
    await this.request({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
      typing_indicator: { type: 'text' },
    });
  }

  /**
   * Download media by its Media ID.
   * Step 1: GET /{media-id} to get the download URL.
   * Step 2: GET the download URL with Bearer auth to get bytes.
   */
  async downloadMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    log.debug({ mediaId }, 'Downloading media via Cloud API');

    // Step 1: Get the media URL
    const metaRes = await fetch(`${GRAPH_API_BASE}/${mediaId}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!metaRes.ok) {
      const errText = await metaRes.text();
      log.error({ status: metaRes.status, body: errText }, 'Failed to get media URL');
      throw new Error(`Cloud API media URL error ${metaRes.status}: ${errText}`);
    }
    const metaJson = (await metaRes.json()) as { url: string; mime_type: string };

    // Step 2: Download the actual file
    const fileRes = await fetch(metaJson.url, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!fileRes.ok) {
      const errText = await fileRes.text();
      log.error({ status: fileRes.status }, 'Failed to download media bytes');
      throw new Error(`Cloud API media download error ${fileRes.status}: ${errText}`);
    }

    const arrayBuffer = await fileRes.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType: metaJson.mime_type,
    };
  }
}

// Lazy singleton — only instantiated if env vars are present
let _instance: WhatsAppCloudApiClient | null = null;

export function getCloudApi(): WhatsAppCloudApiClient {
  if (!_instance) {
    _instance = new WhatsAppCloudApiClient();
  }
  return _instance;
}
