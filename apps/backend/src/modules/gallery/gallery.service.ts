import { prisma } from '../../shared/database/prisma.js';
import { getPresignedUrl } from '../../shared/storage/s3.client.js';
import { createChildLogger } from '../../shared/utils/logger.js';
import { FUNNEL_STATES } from '../funnel/funnel.state-machine.v2.js';
import { trackEvent } from '../analytics/analytics.service.js';
import { getQueue, QUEUE_NAMES, type DeliveryJobData } from '../../shared/queue/queues.js';

const log = createChildLogger('gallery-service');

export interface GalleryImage {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  sequence: number;
  isApproved: boolean;
}

export interface GalleryData {
  sessionId: string;
  leadName: string | null;
  occasion: string;
  packageId: string | null;
  photoCount: number;
  images: GalleryImage[];
  hasApproved: boolean;
}

/**
 * Retorna dados da galeria para display no frontend.
 */
export async function getGalleryData(leadSessionId: string): Promise<GalleryData | null> {
  const session = await prisma.leadSession.findUnique({
    where: { id: leadSessionId },
    include: {
      lead: true,
      generatedImages: { orderBy: { sequence: 'asc' } },
    },
  });

  if (!session) return null;

  const images = await Promise.all(
    session.generatedImages.map(async (img) => ({
      id: img.id,
      url: await getPresignedUrl(img.s3Key),
      thumbnailUrl: img.thumbnailS3Key
        ? await getPresignedUrl(img.thumbnailS3Key)
        : null,
      sequence: img.sequence,
      isApproved: img.isApproved,
    })),
  );

  const prefs = session.preferences as Record<string, string>;
  const hasApproved = session.generatedImages.some((img) => img.isApproved);

  return {
    sessionId: leadSessionId,
    leadName: session.lead.name,
    occasion: prefs.occasion ?? 'casual',
    packageId: prefs.packageId ?? null,
    photoCount: session.generatedImages.length,
    images,
    hasApproved,
  };
}

/**
 * Processa aprovação das imagens selecionadas.
 */
export async function approveImages(
  leadSessionId: string,
  selectedImageIds: string[],
): Promise<{ success: boolean; message: string }> {
  const session = await prisma.leadSession.findUnique({
    where: { id: leadSessionId },
    include: { lead: true, generatedImages: true },
  });

  if (!session) {
    return { success: false, message: 'Sessão não encontrada' };
  }

  // Verificar que os IDs pertencem a esta sessão
  const validIds = session.generatedImages.map((img) => img.id);
  const invalidIds = selectedImageIds.filter((id) => !validIds.includes(id));
  if (invalidIds.length > 0) {
    return { success: false, message: 'IDs de imagem inválidos' };
  }



  // Já aprovou antes → idempotente
  const alreadyApproved = session.generatedImages.some((img) => img.isApproved);
  if (alreadyApproved) {
    return { success: true, message: 'Imagens já aprovadas' };
  }

  // Marcar como aprovadas
  await prisma.generatedImage.updateMany({
    where: { id: { in: selectedImageIds }, leadSessionId },
    data: { isApproved: true },
  });

  // Atualizar estado do funil
  await prisma.leadSession.update({
    where: { id: leadSessionId },
    data: { funnelState: FUNNEL_STATES.APPROVING },
  });

  // Buscar pagamento aprovado para a entrega
  const payment = await prisma.payment.findFirst({
    where: { leadSessionId, status: 'APPROVED' },
  });

  if (payment) {
    // Enfileirar job de entrega
    const queue = getQueue(QUEUE_NAMES.DELIVERY);
    await queue.add('deliver', {
      leadSessionId,
      paymentId: payment.id,
    } satisfies DeliveryJobData);
  }

  await trackEvent(session.leadId, 'IMAGES_APPROVED', {
    selectedCount: selectedImageIds.length,
    totalCount: session.generatedImages.length,
  });

  log.info({ leadSessionId, count: selectedImageIds.length }, 'Imagens aprovadas');
  return { success: true, message: 'Imagens aprovadas com sucesso' };
}
