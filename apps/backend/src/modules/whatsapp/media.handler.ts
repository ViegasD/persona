import { evolutionApi } from './evolution-api.client.js';
import { uploadFile, buildS3Key } from '../../shared/storage/s3.client.js';
import { prisma } from '../../shared/database/prisma.js';
import { createChildLogger } from '../../shared/utils/logger.js';
import { randomUUID } from 'crypto';
import { detectFaceAttributes } from '../image-gen/vision.service.js';

const log = createChildLogger('media-handler');

/**
 * Baixa mídia de uma mensagem via Evolution API e faz upload para S3.
 * Retorna o ReferenceImage criado no banco.
 */
export async function downloadAndStoreMedia(
  remoteJid: string,
  messageId: string,
  fromMe: boolean,
  leadSessionId: string,
): Promise<{ s3Key: string; s3Url: string; mimeType: string; fileSize: number }> {
  log.info({ remoteJid, messageId, leadSessionId }, '[MEDIA] Baixando mídia da mensagem via Evolution API...');

  // Baixar via Evolution API
  const media = await evolutionApi.getMediaBase64(remoteJid, messageId, fromMe);
  log.info({ mimetype: media.mimetype, base64Length: media.base64?.length ?? 0 }, '[MEDIA] ✅ Base64 recebido da Evolution API');

  // Converter base64 para buffer
  const base64Data = media.base64.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');

  // Determinar extensão
  const ext = mimeToExtension(media.mimetype);
  const filename = `${randomUUID()}.${ext}`;

  // Upload para S3
  const s3Key = buildS3Key(leadSessionId, 'references', filename);
  log.info({ s3Key, bufferSize: buffer.length, mimetype: media.mimetype }, '[MEDIA] Uploading to S3/MinIO...');
  await uploadFile(s3Key, buffer, media.mimetype);
  log.info({ s3Key }, '[MEDIA] ✅ Upload to S3/MinIO complete');

  // Salvar no banco
  const refImage = await prisma.referenceImage.create({
    data: {
      leadSessionId,
      s3Key,
      s3Url: s3Key,
      mimeType: media.mimetype,
      fileSize: buffer.length,
    },
  });

  log.info({ s3Key, size: buffer.length, refImageId: refImage.id, leadSessionId }, '[MEDIA] ✅ ReferenceImage saved to DB');

  // Fire-and-forget: detect gender + smile from first face photo (skip couples)
  const session = await prisma.leadSession.findUnique({ where: { id: leadSessionId } });
  const prefs = (session?.preferences as Record<string, unknown>) ?? {};
  const occasion = (prefs.occasion as string) ?? '';
  if (!prefs.detectedGender && occasion !== 'casal') {
    detectFaceAttributes(base64Data, media.mimetype)
      .then(async (attrs) => {
        if (attrs.gender || attrs.smile) {
          const cur = await prisma.leadSession.findUnique({ where: { id: leadSessionId } });
          const curPrefs = (cur?.preferences as Record<string, unknown>) ?? {};
          if (!curPrefs.detectedGender) {
            await prisma.leadSession.update({
              where: { id: leadSessionId },
              data: {
                preferences: {
                  ...curPrefs,
                  ...(attrs.gender && { detectedGender: attrs.gender }),
                  ...(attrs.smile && { detectedSmile: attrs.smile }),
                } as any,
              },
            });
            log.info({ gender: attrs.gender, smile: attrs.smile, leadSessionId }, '[MEDIA] Face attributes detected from selfie');
          }
        }
      })
      .catch((err) => log.warn({ err }, '[MEDIA] Face attribute detection failed'));
  }

  return {
    s3Key: refImage.s3Key,
    s3Url: refImage.s3Url,
    mimeType: refImage.mimeType,
    fileSize: refImage.fileSize,
  };
}

function mimeToExtension(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'application/pdf': 'pdf',
  };
  return map[mime] ?? 'bin';
}
