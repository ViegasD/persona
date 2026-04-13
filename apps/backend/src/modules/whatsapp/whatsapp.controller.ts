import type { FastifyRequest, FastifyReply } from 'fastify';
import { webhookEventSchema, messageUpsertSchema, extractMessageText, getMediaType, isGroupMessage, resolveJid } from './message.handler.js';
import { phoneFromJid } from '../../shared/utils/phone.js';
import { createChildLogger } from '../../shared/utils/logger.js';
import { logInboundMessage } from './whatsapp.service.js';
import { prisma } from '../../shared/database/prisma.js';
import { downloadAndStoreMedia } from './media.handler.js';
import { debounceFunnelMessage } from '../ai/debounce.service.js';
import { transcribeAudio } from '../ai/llm.client.js';
import { env } from '../../shared/config/env.js';

const log = createChildLogger('whatsapp-controller');

/**
 * Processa webhook da Evolution API.
 */
export async function handleEvolutionWebhook(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // Responde 200 imediatamente (padrão webhook)
  reply.status(200).send({ received: true });

  try {
    const parsed = webhookEventSchema.safeParse(request.body);
    if (!parsed.success) {
      log.warn({ body: request.body }, 'Payload inválido no webhook');
      return;
    }

    const { event } = parsed.data;

    // Evolution API sends events in different formats depending on version
    const normalizedEvent = event.toUpperCase().replace(/\./g, '_');

    switch (normalizedEvent) {
      case 'MESSAGES_UPSERT':
        await handleMessagesUpsert(request.body);
        break;

      case 'CONNECTION_UPDATE':
        log.info({ data: parsed.data.data }, 'Status de conexão atualizado');
        break;

      default:
        log.debug({ event }, 'Evento não tratado');
    }
  } catch (error) {
    log.error(error, 'Erro ao processar webhook');
  }
}

async function handleMessagesUpsert(body: unknown): Promise<void> {
  const parsed = messageUpsertSchema.safeParse(body);
  if (!parsed.success) {
    log.warn({ errors: parsed.error.flatten(), body: JSON.stringify(body).substring(0, 500) }, 'Falha ao parsear MESSAGES_UPSERT');
    return;
  }

  const { data } = parsed.data;
  const { key, message, pushName } = data;

  // Resolve o JID canônico (WA Business pode enviar @lid em vez do JID real)
  const jid = resolveJid(key);

  // Ignora mensagens de grupo
  if (isGroupMessage(jid)) return;

  // Ignora mensagens enviadas por nós
  if (key.fromMe) return;

  const phone = phoneFromJid(jid);

  // ── Whitelist filter: when enabled, only respond to listed numbers ──
  if (env.WHITELIST) {
    const allowed = env.WHITELIST_NUMBERS.split(',').map((n) => n.trim()).filter(Boolean);
    const normalized = phone.replace(/\D/g, '');
    if (!allowed.some((n) => normalized.endsWith(n.replace(/\D/g, '')))) {
      log.debug({ phone }, 'Mensagem ignorada — telefone fora da whitelist');
      return;
    }
  }

  const text = extractMessageText(message ?? undefined);
  const mediaType = getMediaType(message ?? undefined);

  log.info({ phone, text: text?.substring(0, 80), mediaType, pushName, messageId: key.id }, '[WEBHOOK] Mensagem recebida');

  // Upsert do lead
  const lead = await prisma.lead.upsert({
    where: { phone },
    create: { phone, name: pushName ?? null, source: 'whatsapp' },
    update: { name: pushName ?? undefined },
  });

  log.info({ leadId: lead.id, phone }, '[WEBHOOK] Lead upserted');

  // ── Audio: transcribe and treat as text ──
  let transcribedText: string | null = null;
  if (mediaType === 'audio') {
    log.info({ phone, messageId: key.id }, '[WEBHOOK:AUDIO] Audio detected — transcribing...');
    try {
      const { evolutionApi } = await import('./evolution-api.client.js');
      const media = await evolutionApi.getMediaBase64(jid, key.id, key.fromMe);
      const base64Data = media.base64.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      transcribedText = await transcribeAudio(buffer, media.mimetype);
      log.info({ phone, textLength: transcribedText.length, text: transcribedText.substring(0, 100) }, '[WEBHOOK:AUDIO] ✅ Transcription complete');
    } catch (err) {
      log.error(err, '[WEBHOOK:AUDIO] ❌ Transcription failed');
    }
  }

  const effectiveText = transcribedText ?? text;

  // ── Download image BEFORE logging so s3Key is available as metadata ──
  let imageS3Key: string | undefined;
  if (mediaType === 'image') {
    log.info({ phone, messageId: key.id }, '[WEBHOOK:IMAGE] Image detected — looking for session...');
    const session = await prisma.leadSession.findFirst({
      where: { leadId: lead.id },
      orderBy: { createdAt: 'desc' },
    });
    if (session) {
      log.info({ sessionId: session.id, funnelState: session.funnelState }, '[WEBHOOK:IMAGE] Session found — downloading media...');
      try {
        const result = await downloadAndStoreMedia(jid, key.id, key.fromMe, session.id);
        imageS3Key = result.s3Key;
        log.info({ s3Key: result.s3Key, fileSize: result.fileSize, mimeType: result.mimeType }, '[WEBHOOK:IMAGE] ✅ Image downloaded and stored');
      } catch (err) {
        log.error(err, '[WEBHOOK:IMAGE] ❌ Falha ao baixar mídia');
      }
    } else {
      log.warn({ leadId: lead.id }, '[WEBHOOK:IMAGE] ⚠️ No session found — image will NOT be stored!');
    }
  }

  // Log da mensagem (use transcribed text for audio)
  await logInboundMessage(
    lead.id,
    effectiveText ?? `[${mediaType ?? 'unknown'}]`,
    mediaType === 'audio' && transcribedText ? 'text' : (mediaType ?? 'text'),
    key.id,
    imageS3Key ? { s3Key: imageS3Key } : undefined,
  );

  log.info({ leadId: lead.id, direction: 'INBOUND', messageType: mediaType ?? 'text' }, '[WEBHOOK] Inbound message logged');

  // ── Skip funnel for non-actionable media (video, document, etc.) ──
  if (mediaType && mediaType !== 'image' && mediaType !== 'audio') {
    log.info({ phone, mediaType }, '[WEBHOOK] Non-actionable media — skipping funnel');
    return;
  }
  // Audio that failed transcription — nothing useful for the funnel
  if (mediaType === 'audio' && !transcribedText) {
    log.info({ phone }, '[WEBHOOK] Audio transcription failed — skipping funnel');
    return;
  }

  // Debounce: accumulate messages for 12s then process batch via LLM
  log.info({ phone, leadId: lead.id }, '[WEBHOOK:DEBOUNCE] Scheduling debounce...');
  await debounceFunnelMessage(phone, lead.id);
  log.info({ phone }, '[WEBHOOK:DEBOUNCE] Debounce scheduled');
}
