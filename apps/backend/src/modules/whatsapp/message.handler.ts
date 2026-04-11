import { z } from 'zod';

/**
 * Schema de validação para o payload de webhook MESSAGES_UPSERT da Evolution API.
 */
export const messageUpsertSchema = z.object({
  event: z.string(),
  instance: z.string(),
  data: z.object({
    key: z.object({
      remoteJid: z.string(),
      remoteJidAlt: z.string().optional(),
      fromMe: z.boolean(),
      id: z.string(),
      addressingMode: z.string().optional(),
    }),
    message: z.object({
      conversation: z.string().optional(),
      imageMessage: z.object({
        url: z.string().optional(),
        mimetype: z.string().optional(),
        caption: z.string().optional(),
      }).optional(),
      videoMessage: z.object({
        url: z.string().optional(),
        mimetype: z.string().optional(),
      }).optional(),
      audioMessage: z.object({
        url: z.string().optional(),
        mimetype: z.string().optional(),
      }).optional(),
      documentMessage: z.object({
        url: z.string().optional(),
        mimetype: z.string().optional(),
        fileName: z.string().optional(),
      }).optional(),
      extendedTextMessage: z.object({
        text: z.string().optional(),
      }).optional(),
    }).optional(),
    messageTimestamp: z.union([z.number(), z.string()]).optional(),
    pushName: z.string().optional(),
  }),
});

export type MessageUpsertPayload = z.infer<typeof messageUpsertSchema>;

/**
 * Schema genérico para qualquer evento do webhook.
 */
export const webhookEventSchema = z.object({
  event: z.string(),
  instance: z.string(),
  data: z.unknown(),
});

export type WebhookEvent = z.infer<typeof webhookEventSchema>;

/**
 * Extrai o texto da mensagem, independente do tipo.
 */
export function extractMessageText(message: MessageUpsertPayload['data']['message']): string | null {
  if (!message) return null;
  return (
    message.conversation ??
    message.extendedTextMessage?.text ??
    message.imageMessage?.caption ??
    null
  );
}

/**
 * Identifica o tipo de mídia da mensagem.
 */
export function getMediaType(message: MessageUpsertPayload['data']['message']): 'image' | 'video' | 'audio' | 'document' | null {
  if (!message) return null;
  if (message.imageMessage) return 'image';
  if (message.videoMessage) return 'video';
  if (message.audioMessage) return 'audio';
  if (message.documentMessage) return 'document';
  return null;
}

/**
 * Verifica se a mensagem é de um grupo (e não chat individual).
 */
export function isGroupMessage(remoteJid: string): boolean {
  return remoteJid.endsWith('@g.us');
}

/**
 * Resolve o JID canônico (@s.whatsapp.net) a partir do key do webhook.
 * WhatsApp Business com LID addressing pode enviar remoteJid como @lid —
 * nesse caso usa remoteJidAlt que sempre contém o JID real do telefone.
 */
export function resolveJid(key: { remoteJid: string; remoteJidAlt?: string }): string {
  if (key.remoteJid.endsWith('@lid') && key.remoteJidAlt) {
    return key.remoteJidAlt;
  }
  return key.remoteJid;
}
