import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getS3Object } from '../../shared/storage/s3.client.js';
import { verifyAdminAuth } from '../../shared/middleware/auth.js';
import { createChildLogger } from '../../shared/utils/logger.js';

const log = createChildLogger('image-proxy');

/**
 * Internal image proxy — protected by admin API key.
 * Called by the Next.js route handler (server-side, same container).
 */
export async function imageProxyRouter(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', verifyAdminAuth);

  app.get('/*', async (request: FastifyRequest, reply: FastifyReply) => {
    const key = (request.params as Record<string, string>)['*'];

    if (!key || !key.startsWith('sessions/')) {
      log.warn({ key }, '[PROXY] Forbidden key prefix');
      reply.status(403).send({ error: 'Forbidden' });
      return;
    }

    try {
      const obj = await getS3Object(key);
      const contentType = obj.ContentType ?? 'image/jpeg';
      const body = await obj.Body?.transformToByteArray();

      if (!body) {
        log.warn({ key }, '[PROXY] Empty S3 body');
        reply.status(404).send({ error: 'Image not found' });
        return;
      }

      reply
        .header('Content-Type', contentType)
        .header('Cache-Control', 'private, max-age=3600')
        .send(Buffer.from(body));
    } catch (err: any) {
      log.warn({ key, code: err?.name, message: err?.message }, '[PROXY] S3 object not found');
      reply.status(404).send({ error: 'Image not found' });
    }
  });
}
