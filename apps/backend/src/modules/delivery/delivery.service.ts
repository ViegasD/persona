import { prisma } from '../../shared/database/prisma.js';
import { getPresignedUrl } from '../../shared/storage/s3.client.js';
import { queueMediaMessage, queueTextMessage, logOutboundMessage } from '../whatsapp/whatsapp.service.js';
import { FUNNEL_STATES } from '../funnel/funnel.state-machine.v2.js';
import { MESSAGES } from '../funnel/messages.templates.js';
import { trackEvent } from '../analytics/analytics.service.js';
import { createChildLogger } from '../../shared/utils/logger.js';

const log = createChildLogger('delivery-service');
const DELAY_BETWEEN_ITEMS_MS = 2000;

/**
 * Envia conteúdo aprovado (imagens e/ou vídeos) via WhatsApp e atualiza status de entrega.
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
      generatedVideos: {
        where: { isApproved: true },
        orderBy: { sequence: 'asc' },
      },
    },
  });

  if (!session) throw new Error('Sessão não encontrada');

  const hasImages = session.generatedImages.length > 0;
  const hasVideos = session.generatedVideos.length > 0;
  if (!hasImages && !hasVideos) throw new Error('Nenhum conteúdo aprovado');

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

  const startMsg = MESSAGES.deliveryStart();
  await queueTextMessage(session.lead.phone, startMsg);
  await logOutboundMessage(session.leadId, startMsg);

  let deliveredImages = 0;
  let deliveredVideos = 0;

  // Deliver images
  for (const image of session.generatedImages) {
    try {
      const isCloud = session.lead.source === 'whatsapp-cloud';
      const url = isCloud && image.s3Url.startsWith('https://')
        ? image.s3Url
        : await getPresignedUrl(image.s3Key, 3600);
      await queueMediaMessage(session.lead.phone, url, {
        mediatype: 'document',
        mimetype: 'image/jpeg',
        caption: `📸 Foto ${image.sequence}`,
        fileName: `ensaio-foto-${image.sequence}.jpg`,
      });
      deliveredImages++;

      await prisma.delivery.update({
        where: { id: delivery.id },
        data: { imagesDelivered: deliveredImages },
      });

      if (deliveredImages < session.generatedImages.length || hasVideos) {
        await sleep(DELAY_BETWEEN_ITEMS_MS);
      }
    } catch (err) {
      log.error({ imageId: image.id, err }, 'Falha ao enviar imagem');
    }
  }

  // Deliver videos
  for (const video of session.generatedVideos) {
    try {
      const url = await getPresignedUrl(video.s3Key, 3600);
      await queueMediaMessage(session.lead.phone, url, {
        mediatype: 'document',
        mimetype: 'video/mp4',
        caption: `🎬 Vídeo ${video.sequence}`,
        fileName: `video-personalizado-${video.sequence}.mp4`,
      });
      deliveredVideos++;

      await prisma.delivery.update({
        where: { id: delivery.id },
        data: { videosDelivered: deliveredVideos },
      });

      if (deliveredVideos < session.generatedVideos.length) {
        await sleep(DELAY_BETWEEN_ITEMS_MS);
      }
    } catch (err) {
      log.error({ videoId: video.id, err }, 'Falha ao enviar vídeo');
    }
  }

  const totalDelivered = deliveredImages + deliveredVideos;

  // Finalizar entrega
  await prisma.delivery.update({
    where: { id: delivery.id },
    data: {
      status: totalDelivered > 0 ? 'COMPLETED' : 'FAILED',
      completedAt: new Date(),
      imagesDelivered: deliveredImages,
      videosDelivered: deliveredVideos,
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

  const doneMsg = MESSAGES.deliveryComplete(totalDelivered);
  await queueTextMessage(session.lead.phone, doneMsg);
  await logOutboundMessage(session.leadId, doneMsg);

  await trackEvent(session.leadId, 'DELIVERY_COMPLETED', {
    deliveredImages,
    deliveredVideos,
    totalImages: session.generatedImages.length,
    totalVideos: session.generatedVideos.length,
  });

  log.info({ leadSessionId, deliveredImages, deliveredVideos }, 'Entrega concluída');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
