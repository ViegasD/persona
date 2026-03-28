import type { FastifyInstance } from 'fastify';
import { handleCloudVerification, handleCloudWebhook } from './whatsapp-cloud.controller.js';

export async function whatsappCloudRouter(app: FastifyInstance): Promise<void> {
  // Parse body as Buffer so we can keep the raw bytes for HMAC verification,
  // then parse JSON manually. This is scoped to this plugin only.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer', bodyLimit: 10 * 1024 * 1024 },
    (_req, body, done) => {
      (_req as any).rawBody = body;
      try {
        done(null, JSON.parse(body.toString('utf8')));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  // GET /whatsapp — Meta webhook verification handshake
  app.get('/whatsapp', handleCloudVerification);

  // POST /whatsapp — Receive webhook events
  app.post('/whatsapp', handleCloudWebhook);
}
