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

export interface GalleryVideo {
  id: string;
  url: string;
  sequence: number;
  isApproved: boolean;
  durationSeconds: number | null;
}

export interface GalleryData {
  sessionId: string;
  leadName: string | null;
  occasion: string;
  packageId: string | null;
  photoCount: number;
  images: GalleryImage[];
  videos: GalleryVideo[];
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
      generatedVideos: { orderBy: { sequence: 'asc' } },
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

  const videos = await Promise.all(
    session.generatedVideos.map(async (vid) => ({
      id: vid.id,
      url: await getPresignedUrl(vid.s3Key),
      sequence: vid.sequence,
      isApproved: vid.isApproved,
      durationSeconds: vid.durationSeconds,
    })),
  );

  const prefs = session.preferences as Record<string, string>;
  const hasApproved = session.generatedImages.some((img) => img.isApproved) ||
    session.generatedVideos.some((vid) => vid.isApproved);

  return {
    sessionId: leadSessionId,
    leadName: session.lead.name,
    occasion: prefs.messageType ?? prefs.occasion ?? 'casual',
    packageId: prefs.packageId ?? null,
    photoCount: session.generatedImages.length,
    images,
    videos,
    hasApproved,
  };
}

/**
 * Processa aprovação das imagens/vídeos selecionados.
 */
export async function approveImages(
  leadSessionId: string,
  selectedImageIds: string[],
  selectedVideoIds?: string[],
): Promise<{ success: boolean; message: string }> {
  const session = await prisma.leadSession.findUnique({
    where: { id: leadSessionId },
    include: { lead: true, generatedImages: true, generatedVideos: true },
  });

  if (!session) {
    return { success: false, message: 'Sessão não encontrada' };
  }

  // Verificar que os IDs de imagem pertencem a esta sessão
  if (selectedImageIds.length > 0) {
    const validIds = session.generatedImages.map((img) => img.id);
    const invalidIds = selectedImageIds.filter((id) => !validIds.includes(id));
    if (invalidIds.length > 0) {
      return { success: false, message: 'IDs de imagem inválidos' };
    }
  }

  // Verificar que os IDs de vídeo pertencem a esta sessão
  if (selectedVideoIds && selectedVideoIds.length > 0) {
    const validVidIds = session.generatedVideos.map((vid) => vid.id);
    const invalidVidIds = selectedVideoIds.filter((id) => !validVidIds.includes(id));
    if (invalidVidIds.length > 0) {
      return { success: false, message: 'IDs de vídeo inválidos' };
    }
  }

  // Já aprovou antes → idempotente
  const alreadyApproved = session.generatedImages.some((img) => img.isApproved) ||
    session.generatedVideos.some((vid) => vid.isApproved);
  if (alreadyApproved) {
    return { success: true, message: 'Conteúdo já aprovado' };
  }

  // Marcar imagens como aprovadas
  if (selectedImageIds.length > 0) {
    await prisma.generatedImage.updateMany({
      where: { id: { in: selectedImageIds }, leadSessionId },
      data: { isApproved: true },
    });
  }

  // Marcar vídeos como aprovados
  if (selectedVideoIds && selectedVideoIds.length > 0) {
    await prisma.generatedVideo.updateMany({
      where: { id: { in: selectedVideoIds }, leadSessionId },
      data: { isApproved: true },
    });
  }

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

  const totalSelected = selectedImageIds.length + (selectedVideoIds?.length ?? 0);
  const totalContent = session.generatedImages.length + session.generatedVideos.length;
  await trackEvent(session.leadId, 'CONTENT_APPROVED', {
    selectedCount: totalSelected,
    totalCount: totalContent,
    imageCount: selectedImageIds.length,
    videoCount: selectedVideoIds?.length ?? 0,
  });

  log.info({ leadSessionId, images: selectedImageIds.length, videos: selectedVideoIds?.length ?? 0 }, 'Conteúdo aprovado');
  return { success: true, message: 'Conteúdo aprovado com sucesso' };
}
