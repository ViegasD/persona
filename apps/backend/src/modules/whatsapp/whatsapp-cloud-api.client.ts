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
}

// Lazy singleton — only instantiated if env vars are present
let _instance: WhatsAppCloudApiClient | null = null;

export function getCloudApi(): WhatsAppCloudApiClient {
  if (!_instance) {
    _instance = new WhatsAppCloudApiClient();
  }
  return _instance;
}
