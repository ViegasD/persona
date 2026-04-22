import { prisma } from '../../shared/database/prisma.js';
import { env } from '../../shared/config/env.js';
import { createChildLogger } from '../../shared/utils/logger.js';
import { createPixPayment } from './mercadopago.client.js';
import { uploadFile, getPresignedUrl } from '../../shared/storage/s3.client.js';
import { getQueue, QUEUE_NAMES, type VideoGenerationJobData } from '../../shared/queue/queues.js';
import { queueTextMessage, logOutboundMessage } from '../whatsapp/whatsapp.service.js';
import { trackEvent } from '../analytics/analytics.service.js';
import { MESSAGES } from '../funnel/messages.templates.js';
import { FUNNEL_STATES } from '../funnel/funnel.state-machine.v2.js';
import { getPackageById, PACKAGES } from '../funnel/packages.config.js';
import QRCode from 'qrcode';

const log = createChildLogger('payment-service');

/**
 * Cria pagamento Pix e registra no banco.
 * Faz upload do QR code para S3 e retorna URL pré-assinada.
 */
export async function initiatePixPayment(
  sessionId: string,
  leadId: string,
): Promise<{ qrImageUrl: string; pixCopyPaste: string; paymentId: string; amount: number }> {
  log.info({ sessionId, leadId }, '[PAYMENT] Creating Pix payment...');

  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });

  // Get package from session preferences
  const session = await prisma.leadSession.findUniqueOrThrow({ where: { id: sessionId } });
  const prefs = (session.preferences as Record<string, string>) ?? {};
  const pkg = getPackageById(prefs.packageId) ?? PACKAGES[PACKAGES.length - 1]; // default to most popular

  // Use priceOverride if set (e.g. upsell promo), otherwise use package base price
  const priceOverride = (prefs as Record<string, unknown>).priceOverride as number | undefined;
  const finalPrice = typeof priceOverride === 'number' && priceOverride > 0 ? priceOverride : pkg.price;

  log.info({ packageId: prefs.packageId ?? 'DEFAULT', pkgId: pkg.id, price: finalPrice, photos: pkg.photos, priceOverride: priceOverride ?? null }, '[PAYMENT] Package resolved');

  const externalReference = `persona_${sessionId}`;

  log.info({ externalReference, amount: finalPrice }, '[PAYMENT] Calling Mercado Pago createPixPayment...');
  const { paymentId: mpPaymentId, qrCode } = await createPixPayment({
    amount: finalPrice,
    description: `Vídeo personalizado com ${pkg.photos} vídeo(s)`,
    externalReference,
    notificationUrl: `${env.API_BASE_URL}/api/webhooks/mercadopago`,
  });

  log.info({ mpPaymentId, hasQrCode: !!qrCode }, '[PAYMENT] ✅ Pix payment created');

  // Generate QR code locally from the Pix EMV string (qrCode) instead of using
  // Mercado Pago's qrCodeBase64. This ensures:
  //  1. High error-correction (H) so the QR survives WhatsApp image compression
  //  2. Large module size (scale 10) for better scan reliability
  //  3. Wide margin (4 modules) for easier detection by scanners
  const qrBuffer = await QRCode.toBuffer(qrCode, {
    errorCorrectionLevel: 'H',
    type: 'png',
    scale: 10,
    margin: 4,
    color: { dark: '#000000', light: '#FFFFFF' },
  });
  const s3Key = `sessions/${sessionId}/pix-qr/${mpPaymentId}.png`;
  await uploadFile(s3Key, qrBuffer, 'image/png');
  const qrImageUrl = await getPresignedUrl(s3Key, 1800); // 30 min, same as QR expiry

  log.info({ s3Key, qrImageUrl: qrImageUrl.substring(0, 80) }, '[PAYMENT] ✅ QR code uploaded to S3');

  const payment = await prisma.payment.create({
    data: {
      leadSessionId: sessionId,
      mercadopagoPaymentId: mpPaymentId,
      amount: finalPrice,
      currency: 'BRL',
      status: 'PENDING',
    },
  });

  log.info({ paymentId: payment.id, mpPaymentId, sessionId }, '[PAYMENT] ✅ Payment record saved to DB');

  return { qrImageUrl, pixCopyPaste: qrCode, paymentId: payment.id, amount: finalPrice };
}

/**
 * Processa webhook de pagamento do Mercado Pago.
 * Chamado quando pagamento é confirmado.
 */
export async function handlePaymentApproved(
  mercadopagoPaymentId: string,
  externalReference: string,
  paymentMethod: string | null,
  amount: number | null,
  paidAt: string | null,
): Promise<void> {
  // Extrair sessionId do external_reference
  const sessionId = externalReference.replace('persona_', '');

  // Atualizar pagamento no banco (idempotente)
  const payment = await prisma.payment.findFirst({
    where: { leadSessionId: sessionId, status: 'PENDING' },
  });

  if (!payment) {
    log.warn({ mercadopagoPaymentId, externalReference }, 'Pagamento não encontrado ou já processado');
    return;
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      mercadopagoPaymentId,
      status: 'APPROVED',
      paymentMethod,
      paidAt: paidAt ? new Date(paidAt) : new Date(),
    },
  });

  // Atualizar lead e sessão
  const session = await prisma.leadSession.findUnique({
    where: { id: sessionId },
    include: { lead: true },
  });

  if (!session) return;

  await prisma.lead.update({
    where: { id: session.leadId },
    data: { status: 'PAID' },
  });

  await prisma.leadSession.update({
    where: { id: sessionId },
    data: { funnelState: FUNNEL_STATES.PAID },
  });

  await trackEvent(session.leadId, 'PAYMENT_APPROVED', {
    mercadopagoPaymentId,
    amount,
    paymentMethod,
  });

  // Notificar lead via WhatsApp
  const confirmMsg = MESSAGES.paymentConfirmed();
  await queueTextMessage(session.lead.phone, confirmMsg);
  await logOutboundMessage(session.leadId, confirmMsg);

  // Disparar geração de vídeos
  await triggerVideoGeneration(sessionId);

  log.info({ sessionId, paymentId: payment.id }, 'Pagamento aprovado, geração iniciada');
}

/**
 * Enfileira job de geração de vídeos (SOMENTE após pagamento aprovado).
 */
export async function triggerVideoGeneration(sessionId: string): Promise<void> {
  const session = await prisma.leadSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) return;

  const generationJob = await prisma.generationJob.create({
    data: {
      leadSessionId: sessionId,
      prompt: '', // Será montado pelo prompt engine no worker
      status: 'QUEUED',
    },
  });

  // Estado permanece PAID — o worker muda para GENERATING após submissão bem-sucedida ao Veo

  const queue = getQueue(QUEUE_NAMES.VIDEO_GENERATION);
  await queue.add('generate', {
    leadSessionId: sessionId,
    generationJobId: generationJob.id,
  } satisfies VideoGenerationJobData);

  log.info({ sessionId, generationJobId: generationJob.id }, 'Job de geração de vídeo enfileirado');
}
