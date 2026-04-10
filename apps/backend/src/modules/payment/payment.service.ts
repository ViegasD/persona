import { prisma } from '../../shared/database/prisma.js';
import { env } from '../../shared/config/env.js';
import { createChildLogger } from '../../shared/utils/logger.js';
import { createPixPayment } from './mercadopago.client.js';
import { uploadFile, getPresignedUrl } from '../../shared/storage/s3.client.js';
import { getQueue, QUEUE_NAMES, type ImageGenerationJobData } from '../../shared/queue/queues.js';
import { queueTextMessage } from '../whatsapp/whatsapp.service.js';
import { trackEvent } from '../analytics/analytics.service.js';
import { MESSAGES } from '../funnel/messages.templates.js';
import { FUNNEL_STATES } from '../funnel/funnel.state-machine.js';
import { getPackageById, PACKAGES } from '../funnel/packages.config.js';

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

  const externalReference = `ensaio_${sessionId}`;

  log.info({ externalReference, amount: finalPrice }, '[PAYMENT] Calling Mercado Pago createPixPayment...');
  const { paymentId: mpPaymentId, qrCode, qrCodeBase64 } = await createPixPayment({
    amount: finalPrice,
    description: `Ensaio fotográfico digital com ${pkg.photos} imagens profissionais`,
    externalReference,
    notificationUrl: `${env.API_BASE_URL}/api/webhooks/mercadopago`,
  });

  log.info({ mpPaymentId, hasQrCode: !!qrCode }, '[PAYMENT] ✅ Pix payment created');

  // Upload QR code image to S3
  const qrBuffer = Buffer.from(qrCodeBase64, 'base64');
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
  const sessionId = externalReference.replace('ensaio_', '');

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
  await queueTextMessage(
    session.lead.phone,
    MESSAGES.paymentConfirmed(session.lead.name ?? 'cliente'),
  );

  // Disparar geração de imagens
  await triggerImageGeneration(sessionId);

  log.info({ sessionId, paymentId: payment.id }, 'Pagamento aprovado, geração iniciada');
}

/**
 * Enfileira job de geração de imagens (SOMENTE após pagamento aprovado).
 */
export async function triggerImageGeneration(sessionId: string): Promise<void> {
  // Criar job de geração no banco
  const session = await prisma.leadSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) return;

  const prefs = session.preferences as Record<string, string>;

  const generationJob = await prisma.generationJob.create({
    data: {
      leadSessionId: sessionId,
      prompt: '', // Será montado pelo prompt engine no worker
      status: 'QUEUED',
    },
  });

  // Estado permanece PAID — o worker muda para GENERATING após submissão bem-sucedida ao Kie.ai

  // Enfileirar no BullMQ
  const queue = getQueue(QUEUE_NAMES.IMAGE_GENERATION);
  await queue.add('generate', {
    leadSessionId: sessionId,
    generationJobId: generationJob.id,
  } satisfies ImageGenerationJobData);

  log.info({ sessionId, generationJobId: generationJob.id }, 'Job de geração enfileirado');
}
