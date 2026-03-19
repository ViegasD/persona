import type { FastifyInstance } from 'fastify';
import { handleEvolutionWebhook } from './whatsapp.controller.js';
import { verifyEvolutionWebhook } from '../../shared/middleware/auth.js';

export async function whatsappRouter(app: FastifyInstance): Promise<void> {
  // Webhook da Evolution API — large bodyLimit because image events can be big
  app.post('/evolution', {
    bodyLimit: 50 * 1024 * 1024, // 50 MB
    preHandler: [verifyEvolutionWebhook],
    handler: handleEvolutionWebhook,
  });
}
