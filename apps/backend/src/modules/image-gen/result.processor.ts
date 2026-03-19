import { prisma } from '../../shared/database/prisma.js';
import { uploadFile, buildS3Key, getPresignedUrl } from '../../shared/storage/s3.client.js';
import { createChildLogger } from '../../shared/utils/logger.js';
import { randomUUID } from 'crypto';

const log = createChildLogger('result-processor');

/**
 * Baixa imagens geradas pela Kie.ai e armazena no S3.
 */
export async function processGeneratedImages(
  imageUrls: string[],
  generationJobId: string,
  leadSessionId: string,
): Promise<string[]> {
  const imageIds: string[] = [];

  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i];
    try {
      // Baixar imagem
      const response = await fetch(url);
      if (!response.ok) {
        log.error({ url, status: response.status }, 'Falha ao baixar imagem gerada');
        continue;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const filename = `${randomUUID()}.jpg`;

      // Upload original
      const s3Key = buildS3Key(leadSessionId, 'generated', filename);
      await uploadFile(s3Key, buffer, 'image/jpeg');

      // TODO: Gerar thumbnail (pode usar sharp quando necessário)
      const thumbnailKey = buildS3Key(leadSessionId, 'thumbnails', `thumb_${filename}`);

      // Registrar no banco
      const image = await prisma.generatedImage.create({
        data: {
          generationJobId,
          leadSessionId,
          s3Key,
          s3Url: s3Key,
          thumbnailS3Key: thumbnailKey,
          isApproved: false,
          sequence: i + 1,
        },
      });

      imageIds.push(image.id);
      log.debug({ imageId: image.id, sequence: i + 1 }, 'Imagem processada');
    } catch (error) {
      log.error({ url, error }, 'Erro ao processar imagem individual');
    }
  }

  log.info({ count: imageIds.length, generationJobId }, 'Batch de imagens processado');
  return imageIds;
}

/**
 * Obtém URLs pré-assinadas para visualização das imagens de uma sessão.
 */
export async function getImagePresignedUrls(
  leadSessionId: string,
): Promise<Array<{ id: string; url: string; thumbnailUrl: string | null; sequence: number; isApproved: boolean }>> {
  const images = await prisma.generatedImage.findMany({
    where: { leadSessionId },
    orderBy: { sequence: 'asc' },
  });

  return Promise.all(
    images.map(async (img) => ({
      id: img.id,
      url: await getPresignedUrl(img.s3Key),
      thumbnailUrl: img.thumbnailS3Key
        ? await getPresignedUrl(img.thumbnailS3Key)
        : null,
      sequence: img.sequence,
      isApproved: img.isApproved,
    })),
  );
}
