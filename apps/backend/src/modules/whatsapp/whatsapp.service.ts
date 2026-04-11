import { evolutionApi } from './evolution-api.client.js';
import { getCloudApi } from './whatsapp-cloud-api.client.js';
import { getQueue, QUEUE_NAMES, type WhatsAppSendJobData } from '../../shared/queue/queues.js';
import { prisma } from '../../shared/database/prisma.js';
import { createChildLogger } from '../../shared/utils/logger.js';
import { env } from '../../shared/config/env.js';
import { getRedisConnection } from '../../shared/queue/queue.config.js';
import type { Job } from 'bullmq';

const log = createChildLogger('whatsapp-service');

/**
 * Envia mensagem de texto via fila (evita rate limiting).
 */
export async function queueTextMessage(
  phone: string,
  text: string,
  options?: { typingDelay?: number; jobDelay?: number },
): Promise<void> {
  const queue = getQueue(QUEUE_NAMES.WHATSAPP_SEND);
  await queue.add(
    'send-text',
    {
      phone,
      type: 'text',
      payload: { text, delay: options?.typingDelay },
    } satisfies WhatsAppSendJobData,
    options?.jobDelay ? { delay: options.jobDelay } : undefined,
  );
}

/**
 * Envia mídia via fila.
 */
export async function queueMediaMessage(
  phone: string,
  mediaUrl: string,
  options: {
    mediatype: 'image' | 'video' | 'document';
    mimetype: string;
    caption?: string;
    fileName?: string;
  },
): Promise<void> {
  const queue = getQueue(QUEUE_NAMES.WHATSAPP_SEND);
  await queue.add('send-media', {
    phone,
    type: 'media',
    payload: { mediaUrl, ...options },
  } satisfies WhatsAppSendJobData);
}

/**
 * Salva mensagem de saída no banco.
 */
export async function logOutboundMessage(
  leadId: string,
  content: string,
  messageType: string = 'text',
  whatsappMessageId?: string,
): Promise<void> {
  await prisma.conversationMessage.create({
    data: {
      leadId,
      direction: 'OUTBOUND',
      messageType,
      content,
      whatsappMessageId,
    },
  });
}

/**
 * Salva mensagem de entrada no banco.
 */
export async function logInboundMessage(
  leadId: string,
  content: string,
  messageType: string = 'text',
  whatsappMessageId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await prisma.conversationMessage.create({
    data: {
      leadId,
      direction: 'INBOUND',
      messageType,
      content,
      whatsappMessageId,
      metadata: (metadata ?? {}) as any,
    },
  });
}

/**
 * Fire "typing..." indicator for a lead (Cloud API only — Evolution uses delay param).
 * Call this before long operations (e.g. LLM call) so the client sees activity.
 */
export async function showTypingForLead(phone: string): Promise<void> {
  try {
    if (!env.WA_CLOUD_API_TOKEN || !env.WA_PHONE_NUMBER_ID) return;
    const lead = await prisma.lead.findFirst({ where: { phone }, select: { source: true } });
    if (lead?.source !== 'whatsapp-cloud') return;
    const lastMsgId = await getRedisConnection().get(`lastMsgId:${phone}`);
    if (lastMsgId) {
      await getCloudApi().showTypingIndicator(lastMsgId);
    }
  } catch { /* fire-and-forget */ }
}

/**
 * Worker processor para fila de envio WhatsApp.
 */
export async function processWhatsAppSend(job: Job<WhatsAppSendJobData>): Promise<void> {
  const { phone, type, payload } = job.data;
  log.debug({ phone, type, jobId: job.id }, 'Processando envio WhatsApp');

  // Detect channel: if lead came from Cloud API, route outbound there too
  const useCloud = await isCloudLead(phone);

  if (useCloud) {
    await processCloudSend(phone, type, payload);
  } else {
    await processEvolutionSend(phone, type, payload);
  }
}

async function isCloudLead(phone: string): Promise<boolean> {
  if (!env.WA_CLOUD_API_TOKEN || !env.WA_PHONE_NUMBER_ID) return false;
  const lead = await prisma.lead.findFirst({
    where: { phone },
    select: { source: true },
  });
  return lead?.source === 'whatsapp-cloud';
}

async function processCloudSend(
  phone: string,
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const api = getCloudApi();

  // Re-fire typing indicator before every outbound message
  try {
    const lastMsgId = await getRedisConnection().get(`lastMsgId:${phone}`);
    if (lastMsgId) {
      await api.showTypingIndicator(lastMsgId).catch(() => {});
    }
  } catch { /* fire-and-forget */ }

  // Cloud API: typing indicator is already shown above — no need to sleep.
  // The indicator stays visible until the message arrives, giving a natural feel.

  switch (type) {
    case 'text': {
      const { text } = payload as { text: string };
      await api.sendText(phone, text);
      break;
    }
    case 'media': {
      const { mediaUrl, mediatype, caption } = payload as {
        mediaUrl: string;
        mediatype?: string;
        caption?: string;
      };
      if (mediatype === 'image' && mediaUrl) {
        await api.sendImage(phone, mediaUrl, caption);
      } else if (mediaUrl) {
        // For non-image media, send URL as text with caption
        log.warn({ phone, mediatype }, 'Cloud API: non-image media — sending URL + caption as text');
        await api.sendText(phone, caption ? `${caption}\n${mediaUrl}` : mediaUrl);
      } else if (caption) {
        await api.sendText(phone, caption);
      }
      break;
    }
    case 'reaction': {
      log.warn({ phone }, 'Cloud API does not support reactions — skipping');
      break;
    }
  }
}

async function processEvolutionSend(
  phone: string,
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  switch (type) {
    case 'text': {
      const { text, delay } = payload as { text: string; delay?: number };
      await evolutionApi.sendText(phone, text, { delay });
      break;
    }
    case 'media': {
      const { mediaUrl, mediatype, mimetype, caption, fileName } = payload as {
        mediaUrl: string;
        mediatype: 'image' | 'video' | 'document';
        mimetype: string;
        caption?: string;
        fileName?: string;
      };
      await evolutionApi.sendMedia(phone, mediaUrl, {
        mediatype,
        mimetype,
        caption,
        fileName,
      });
      break;
    }
    case 'reaction': {
      const { remoteJid, messageId, reaction, fromMe } = payload as {
        remoteJid: string;
        messageId: string;
        reaction: string;
        fromMe: boolean;
      };
      await evolutionApi.sendReaction(remoteJid, messageId, reaction, fromMe);
      break;
    }
  }
}
