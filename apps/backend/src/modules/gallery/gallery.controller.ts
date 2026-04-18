import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { verifyGalleryToken, validateTokenInDb } from './token.service.js';
import { getGalleryData, approveImages } from './gallery.service.js';
import { createChildLogger } from '../../shared/utils/logger.js';

const log = createChildLogger('gallery-controller');

const approveSchema = z.object({
  imageIds: z.array(z.string().uuid()).default([]),
  videoIds: z.array(z.string().uuid()).default([]),
}).refine((data) => data.imageIds.length > 0 || data.videoIds.length > 0, {
  message: 'Selecione pelo menos uma imagem ou vídeo',
});

/**
 * Middleware: resolve token → sessionId e injeta no request.
 */
async function resolveToken(
  request: FastifyRequest<{ Params: { token: string } }>,
  reply: FastifyReply,
): Promise<string | undefined> {
  const { token } = request.params;

  const payload = verifyGalleryToken(token);
  if (!payload) {
    reply.status(401).send({ error: 'Token inválido ou expirado' });
    return undefined;
  }

  const sessionId = await validateTokenInDb(token);
  if (!sessionId) {
    reply.status(401).send({ error: 'Token revogado ou não encontrado' });
    return undefined;
  }

  return sessionId;
}

/**
 * GET /api/gallery/:token — retorna dados da galeria.
 */
export async function handleGetGallery(
  request: FastifyRequest<{ Params: { token: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const sessionId = await resolveToken(request, reply);
  if (!sessionId) return;

  const data = await getGalleryData(sessionId);
  if (!data) {
    reply.status(404).send({ error: 'Galeria não encontrada' });
    return;
  }

  reply.send(data);
}

/**
 * POST /api/gallery/:token/approve — submete seleção de imagens.
 */
export async function handleApproveImages(
  request: FastifyRequest<{ Params: { token: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const sessionId = await resolveToken(request, reply);
  if (!sessionId) return;

  const parsed = approveSchema.safeParse(request.body);
  if (!parsed.success) {
    reply.status(400).send({ error: 'Dados inválidos', details: parsed.error.flatten() });
    return;
  }

  const result = await approveImages(sessionId, parsed.data.imageIds, parsed.data.videoIds);

  if (!result.success) {
    reply.status(400).send({ error: result.message });
    return;
  }

  reply.send({ success: true, message: result.message });
}

/**
 * GET /api/gallery/:token/status — retorna status atual da sessão.
 */
export async function handleGetGalleryStatus(
  request: FastifyRequest<{ Params: { token: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const sessionId = await resolveToken(request, reply);
  if (!sessionId) return;

  const data = await getGalleryData(sessionId);
  if (!data) {
    reply.status(404).send({ error: 'Galeria não encontrada' });
    return;
  }

  reply.send({
    sessionId,
    hasApproved: data.hasApproved,
    imageCount: data.images.length,
    videoCount: data.videos.length,
    approvedCount: data.images.filter((i) => i.isApproved).length +
      data.videos.filter((v) => v.isApproved).length,
  });
}
