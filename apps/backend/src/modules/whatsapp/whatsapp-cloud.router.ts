import { Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { handleCloudVerification, handleCloudWebhook } from './whatsapp-cloud.controller.js';

export async function whatsappCloudRouter(app: FastifyInstance): Promise<void> {
  // Capture raw body for HMAC signature verification on POST requests
  app.addHook('preParsing', async (request, _reply, payload) => {
    if (request.method !== 'POST') return payload;

    const chunks: Buffer[] = [];
    for await (const chunk of payload) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buf = Buffer.concat(chunks);
    (request as any).rawBody = buf;
    return Readable.from(buf);
  });

  // GET /whatsapp — Meta webhook verification handshake
  app.get('/whatsapp', handleCloudVerification);

  // POST /whatsapp — Receive webhook events
  app.post('/whatsapp', {
    bodyLimit: 10 * 1024 * 1024,
    handler: handleCloudWebhook,
  });
}
