import jwt from 'jsonwebtoken';
import { prisma } from '../../shared/database/prisma.js';
import { env } from '../../shared/config/env.js';
import { createChildLogger } from '../../shared/utils/logger.js';

const log = createChildLogger('token-service');

interface GalleryTokenPayload {
  sessionId: string;
  type: 'gallery';
}

/**
 * Cria um token JWT para acesso à galeria.
 */
export async function createGalleryToken(
  leadSessionId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const payload: GalleryTokenPayload = {
    sessionId: leadSessionId,
    type: 'gallery',
  };

  const token = jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_GALLERY_EXPIRY as any,
  });

  const decoded = jwt.decode(token) as { exp: number };
  const expiresAt = new Date(decoded.exp * 1000);

  await prisma.approvalToken.create({
    data: {
      leadSessionId,
      token,
      expiresAt,
    },
  });

  log.info({ leadSessionId }, 'Token de galeria criado');
  return { token, expiresAt };
}

/**
 * Valida token da galeria e retorna o sessionId.
 */
export function verifyGalleryToken(token: string): GalleryTokenPayload | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as GalleryTokenPayload;
    if (payload.type !== 'gallery') return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Verifica se o token existe no banco e não foi revogado.
 */
export async function validateTokenInDb(token: string): Promise<string | null> {
  const record = await prisma.approvalToken.findUnique({ where: { token } });

  if (!record) return null;
  if (record.expiresAt < new Date()) return null;

  return record.leadSessionId;
}
