import { prisma } from '../../shared/database/prisma.js';
import { getPresignedUrl } from '../../shared/storage/s3.client.js';
import { queueMediaMessage, queueTextMessage } from '../whatsapp/whatsapp.service.js';
import { FUNNEL_STATES } from '../funnel/funnel.state-machine.v2.js';
import { MESSAGES } from '../funnel/messages.templates.js';
import { trackEvent } from '../analytics/analytics.service.js';
import { createChildLogger } from '../../shared/utils/logger.js';

const log = createChildLogger('delivery-service');
const DELAY_BETWEEN_IMAGES_MS = 2000;

/**
 * Envia imagens aprovadas via WhatsApp e atualiza status de entrega.
 */
export async function deliverApprovedImages(
  leadSessionId: string,
  paymentId: string,
): Promise<void> {
  const session = await prisma.leadSession.findUnique({
    where: { id: leadSessionId },
    include: {
      lead: true,
      generatedImages: {
        where: { isApproved: true },
        orderBy: { sequence: 'asc' },
      },
    },
  });

  if (!session) throw new Error('Sessão não encontrada');
  if (session.generatedImages.length === 0) throw new Error('Nenhuma imagem aprovada');

  // Criar registro de entrega
  const delivery = await prisma.delivery.create({
    data: {
      leadSessionId,
      paymentId,
      status: 'DELIVERING',
    },
  });

  // Atualizar estado do funil
  await prisma.leadSession.update({
    where: { id: leadSessionId },
    data: { funnelState: FUNNEL_STATES.DELIVERING },
  });

  await queueTextMessage(session.lead.phone, MESSAGES.deliveryStart());

  let delivered = 0;

  for (const image of session.generatedImages) {
    try {
      // Use the original Kie.ai HTTPS URL (stored in s3Url) for Cloud API leads,
      // fall back to presigned S3 URL for Evolution API leads.
      const isCloud = session.lead.source === 'whatsapp-cloud';
      const url = isCloud && image.s3Url.startsWith('https://')
        ? image.s3Url
        : await getPresignedUrl(image.s3Key, 3600);
      await queueMediaMessage(session.lead.phone, url, {
        mediatype: 'image',
        mimetype: 'image/jpeg',
        caption: `📸 Foto ${image.sequence}`,
      });
      delivered++;

      await prisma.delivery.update({
        where: { id: delivery.id },
        data: { imagesDelivered: delivered },
      });

      // Delay entre envios para não sobrecarregar
      if (delivered < session.generatedImages.length) {
        await sleep(DELAY_BETWEEN_IMAGES_MS);
      }
    } catch (err) {
      log.error({ imageId: image.id, err }, 'Falha ao enviar imagem');
    }
  }

  // Finalizar entrega
  await prisma.delivery.update({
    where: { id: delivery.id },
    data: {
      status: delivered > 0 ? 'COMPLETED' : 'FAILED',
      completedAt: new Date(),
      imagesDelivered: delivered,
    },
  });

  await prisma.leadSession.update({
    where: { id: leadSessionId },
    data: { funnelState: FUNNEL_STATES.DELIVERED },
  });

  await prisma.lead.update({
    where: { id: session.leadId },
    data: { status: 'DELIVERED' },
  });

  await queueTextMessage(session.lead.phone, MESSAGES.deliveryComplete(delivered));

  await trackEvent(session.leadId, 'DELIVERY_COMPLETED', {
    delivered,
    total: session.generatedImages.length,
  });

  log.info({ leadSessionId, delivered }, 'Entrega concluída');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
