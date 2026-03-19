import type { FastifyInstance } from 'fastify';
import { handleMercadoPagoWebhook } from './payment.webhook.js';

export async function paymentRouter(app: FastifyInstance): Promise<void> {
  // Webhook do Mercado Pago
  app.post('/webhooks/mercadopago', handleMercadoPagoWebhook);
}
