import { createHmac, timingSafeEqual } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { createChildLogger } from '../../shared/utils/logger.js';
import { logInboundMessage } from './whatsapp.service.js';
import { prisma } from '../../shared/database/prisma.js';
import { debounceFunnelMessage } from '../ai/debounce.service.js';
import { env } from '../../shared/config/env.js';
import { getCloudApi } from './whatsapp-cloud-api.client.js';
import { uploadFile, buildS3Key } from '../../shared/storage/s3.client.js';
import { detectGenderFromPhoto } from '../image-gen/vision.service.js';

const log = createChildLogger('whatsapp-cloud-controller');

// ─── Webhook Verification (GET) ────────────────────────────

export async function handleCloudVerification(
  request: FastifyRequest<{
    Querystring: {
      'hub.mode'?: string;
      'hub.verify_token'?: string;
      'hub.challenge'?: string;
    };
  }>,
  reply: FastifyReply,
): Promise<void> {
  const mode = request.query['hub.mode'];
  const token = request.query['hub.verify_token'];
  const challenge = request.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.WA_VERIFY_TOKEN) {
    log.info('Webhook verification succeeded');
    reply.type('text/plain').status(200).send(challenge);
    return;
  }

  log.warn({ mode, tokenMatch: token === env.WA_VERIFY_TOKEN }, 'Webhook verification failed');
  reply.status(403).send({ error: 'Forbidden' });
}

// ─── Webhook Event Handler (POST) ──────────────────────────

export async function handleCloudWebhook(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  log.info({ method: request.method, url: request.url }, '[CLOUD WEBHOOK] POST recebido');

  // Respond 200 immediately (Meta requirement)
  reply.status(200).send({ received: true });

  try {
    // HMAC signature verification
    if (env.WA_APP_SECRET) {
      const signature = request.headers['x-hub-signature-256'] as string | undefined;
      const rawBody = (request as any).rawBody as Buffer | undefined;

      log.info({ hasSignature: !!signature, hasRawBody: !!rawBody, rawBodyLen: rawBody?.length }, '[CLOUD WEBHOOK] HMAC check');

      if (!signature || !rawBody) {
        log.warn('Missing signature or raw body — rejecting');
        return;
      }

      const expected = 'sha256=' + createHmac('sha256', env.WA_APP_SECRET)
        .update(rawBody)
        .digest('hex');

      const sigBuf = Buffer.from(signature);
      const expBuf = Buffer.from(expected);

      if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
        log.warn({ receivedLen: sigBuf.length, expectedLen: expBuf.length }, 'Invalid HMAC signature — rejecting');
        return;
      }

      log.info('[CLOUD WEBHOOK] HMAC válido');
    } else {
      log.info('[CLOUD WEBHOOK] WA_APP_SECRET não configurado — pulando HMAC');
    }

    const body = request.body as CloudWebhookPayload;

    log.info({ object: body?.object, hasEntry: !!body?.entry, entryLen: body?.entry?.length }, '[CLOUD WEBHOOK] Payload parsed');

    if (body.object !== 'whatsapp_business_account') {
      log.info({ object: body.object, body: JSON.stringify(body).substring(0, 500) }, '[CLOUD WEBHOOK] Payload ignorado — object não é whatsapp_business_account');
      return;
    }

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages') continue;

        const value = change.value;
        const messages = value?.messages;
        if (!messages || messages.length === 0) {
          log.info({ field: change.field }, '[CLOUD WEBHOOK] Change sem messages — possível status/delivery update, ignorando');
          continue;
        }

        const msg = messages[0];
        const phone = msg.from; // E.164 without '+', e.g. "5511999999999"
        const messageId = msg.id;
        const pushName = value.contacts?.[0]?.profile?.name ?? null;
        const text = msg.text?.body ?? null;
        const mediaType = msg.type; // 'text', 'image', 'audio', 'document', 'video', etc.

        // Whitelist filter
        if (env.WHITELIST) {
          const allowed = env.WHITELIST_NUMBERS.split(',').map((n) => n.trim()).filter(Boolean);
          const normalized = phone.replace(/\D/g, '');
          if (!allowed.some((n) => normalized.endsWith(n.replace(/\D/g, '')))) {
            log.debug({ phone }, 'Mensagem ignorada — telefone fora da whitelist');
            continue;
          }
        }

        log.info(
          { phone, text: text?.substring(0, 80), mediaType, pushName, messageId },
          '[CLOUD WEBHOOK] Mensagem recebida',
        );

        // Upsert lead
        const lead = await prisma.lead.upsert({
          where: { phone },
          create: { phone, name: pushName, source: 'whatsapp-cloud' },
          update: { name: pushName ?? undefined, source: 'whatsapp-cloud' },
        });

        log.info({ leadId: lead.id, phone }, '[CLOUD WEBHOOK] Lead upserted');

        // Log inbound message
        await logInboundMessage(
          lead.id,
          text ?? `[${mediaType}]`,
          mediaType,
          messageId,
        );

        // Handle image uploads — download from Meta and store as reference
        if (mediaType === 'image' && msg.image?.id) {
          log.info({ phone, mediaId: msg.image.id, messageId }, '[CLOUD WEBHOOK:IMAGE] Image detected — downloading...');
          const session = await prisma.leadSession.findFirst({
            where: { leadId: lead.id },
            orderBy: { createdAt: 'desc' },
          });
          if (session) {
            try {
              const api = getCloudApi();
              const { buffer, mimeType } = await api.downloadMedia(msg.image.id);
              const extMap: Record<string, string> = {
                'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
              };
              const ext = extMap[mimeType] ?? 'jpg';
              const filename = `${randomUUID()}.${ext}`;
              const isStyleRef = session.funnelState === 'COLLECTING_STYLE_REFS';
              const folder = isStyleRef ? 'style-refs' as const : 'references' as const;
              const imageType = isStyleRef ? 'style' : 'face';
              const s3Key = buildS3Key(session.id, folder, filename);
              await uploadFile(s3Key, buffer, mimeType);
              await prisma.referenceImage.create({
                data: {
                  leadSessionId: session.id,
                  s3Key,
                  s3Url: s3Key,
                  mimeType,
                  fileSize: buffer.length,
                  type: imageType,
                },
              });
              log.info({ s3Key, fileSize: buffer.length, mimeType, imageType }, '[CLOUD WEBHOOK:IMAGE] ✅ Image stored');

              // Fire-and-forget: detect gender from face photos (first photo only, skip couples)
              if (imageType === 'face') {
                const prefs = (session.preferences as Record<string, unknown>) ?? {};
                const occasion = (prefs.occasion as string) ?? '';
                if (!prefs.detectedGender && occasion !== 'casal') {
                  detectGenderFromPhoto(buffer.toString('base64'), mimeType)
                    .then(async (gender) => {
                      if (gender) {
                        const current = await prisma.leadSession.findUnique({ where: { id: session.id } });
                        const curPrefs = (current?.preferences as Record<string, unknown>) ?? {};
                        if (!curPrefs.detectedGender) {
                          await prisma.leadSession.update({
                            where: { id: session.id },
                            data: { preferences: { ...curPrefs, detectedGender: gender } as any },
                          });
                          log.info({ gender, sessionId: session.id }, '[CLOUD WEBHOOK:IMAGE] Gender detected from selfie');
                        }
                      }
                    })
                    .catch((err) => log.warn({ err }, '[CLOUD WEBHOOK:IMAGE] Gender detection failed'));
                }
              }
            } catch (err) {
              log.error(err, '[CLOUD WEBHOOK:IMAGE] ❌ Failed to download/store image');
            }
          } else {
            log.warn({ leadId: lead.id }, '[CLOUD WEBHOOK:IMAGE] ⚠️ No session found — image NOT stored');
          }
        }

        // Mark as read + show typing indicator (fire-and-forget)
        if (env.WA_CLOUD_API_TOKEN && env.WA_PHONE_NUMBER_ID) {
          getCloudApi().showTypingIndicator(messageId).catch((err) => {
            log.warn(err, 'Failed to show typing indicator');
          });
        }

        // Route through funnel debounce
        await debounceFunnelMessage(phone, lead.id);
      }
    }
  } catch (error) {
    log.error(error, 'Erro ao processar Cloud API webhook');
  }
}

// ─── Types ──────────────────────────────────────────────────

interface CloudWebhookPayload {
  object: string;
  entry?: Array<{
    id: string;
    changes?: Array<{
      field: string;
      value: {
        messaging_product?: string;
        metadata?: { phone_number_id: string; display_phone_number: string };
        contacts?: Array<{ profile: { name: string }; wa_id: string }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          type: string;
          text?: { body: string };
          image?: { id: string; mime_type: string; sha256: string };
          audio?: { id: string; mime_type: string };
          document?: { id: string; mime_type: string; filename: string };
          video?: { id: string; mime_type: string };
        }>;
        statuses?: Array<unknown>;
      };
    }>;
  }>;
}
