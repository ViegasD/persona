import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createHmac } from 'node:crypto';
import { getS3Object } from '../../shared/storage/s3.client.js';
import { env } from '../../shared/config/env.js';
import { createChildLogger } from '../../shared/utils/logger.js';

const log = createChildLogger('image-proxy');

/** Sign an S3 key so the proxy can verify it without exposing the master API key. */
export function signS3Key(s3Key: string): string {
  return createHmac('sha256', env.JWT_SECRET).update(s3Key).digest('hex').slice(0, 16);
}

/** Build a full proxy URL with signature for embedding in <img> tags. */
export function proxyUrl(s3Key: string): string {
  const sig = signS3Key(s3Key);
  return `${env.API_BASE_URL}/api/admin/proxy/${s3Key}?sig=${sig}`;
}

/**
 * Image proxy — registered WITHOUT admin auth so <img> tags can load.
 * Verifies HMAC signature per S3 key.
 */
export async function imageProxyRouter(app: FastifyInstance): Promise<void> {
  app.get('/*', async (request: FastifyRequest, reply: FastifyReply) => {
    const key = (request.params as Record<string, string>)['*'];
    const sig = (request.query as Record<string, string>).sig;

    // Verify HMAC signature
    if (!sig || sig !== signS3Key(key)) {
      log.warn({ key, sig }, '[PROXY] Invalid signature');
      reply.status(403).send({ error: 'Invalid signature' });
      return;
    }

    // Only allow keys under sessions/ prefix
    if (!key.startsWith('sessions/')) {
      log.warn({ key }, '[PROXY] Forbidden key prefix');
      reply.status(403).send({ error: 'Forbidden' });
      return;
    }

    try {
      const obj = await getS3Object(key);
      const contentType = obj.ContentType ?? 'image/jpeg';

      reply
        .header('Content-Type', contentType)
        .header('Cache-Control', 'private, max-age=3600')
        .send(obj.Body);
    } catch (err: any) {
      log.warn({ key, code: err?.name, message: err?.message }, '[PROXY] S3 object not found');
      reply.status(404).send({ error: 'Image not found' });
    }
  });
}
