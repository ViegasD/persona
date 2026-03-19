import type { FastifyRequest, FastifyReply } from 'fastify';
import { createChildLogger } from '../../shared/utils/logger.js';
import { handlePaymentApproved } from './payment.service.js';
import { getPaymentDetails } from './mercadopago.client.js';

const log = createChildLogger('payment-webhook');

interface MercadoPagoWebhookBody {
  action?: string;
  type?: string;
  data?: { id?: string };
}

/**
 * Processa webhook do Mercado Pago.
 * Ref: https://www.mercadopago.com.br/developers/en/docs/checkout-pro/additional-content/notifications/webhooks
 */
export async function handleMercadoPagoWebhook(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // Responder 200 imediatamente
  reply.status(200).send({ received: true });

  try {
    const body = request.body as MercadoPagoWebhookBody;

    // Mercado Pago envia webhooks para diversos eventos
    if (body.type !== 'payment' || !body.data?.id) {
      log.debug({ type: body.type, action: body.action }, 'Webhook MP não é payment, ignorando');
      return;
    }

    const paymentId = body.data.id;
    log.info({ paymentId, action: body.action }, 'Webhook de pagamento recebido');

    // Buscar detalhes completos do pagamento
    const details = await getPaymentDetails(paymentId);

    if (details.status === 'approved' && details.externalReference) {
      await handlePaymentApproved(
        paymentId,
        details.externalReference,
        details.paymentMethod ?? null,
        details.amount ?? null,
        details.paidAt ?? null,
      );
    } else {
      log.info({ paymentId, status: details.status }, 'Pagamento não aprovado ainda');
    }
  } catch (error) {
    log.error(error, 'Erro ao processar webhook MP');
  }
}
