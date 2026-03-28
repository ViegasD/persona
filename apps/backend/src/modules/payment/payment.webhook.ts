import { createHmac, timingSafeEqual } from 'crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { createChildLogger } from '../../shared/utils/logger.js';
import { env } from '../../shared/config/env.js';
import { handlePaymentApproved } from './payment.service.js';
import { getPaymentDetails } from './mercadopago.client.js';

const log = createChildLogger('payment-webhook');

interface MercadoPagoWebhookBody {
  action?: string;
  type?: string;
  data?: { id?: string };
}

/**
 * Verifica a assinatura HMAC-SHA256 do webhook do Mercado Pago.
 * Ref: https://www.mercadopago.com.br/developers/en/docs/your-integrations/notifications/webhooks
 *
 * Manifest template: id:[data.id_url];request-id:[x-request-id];ts:[ts];
 */
function verifyMercadoPagoSignature(request: FastifyRequest): boolean {
  const secret = env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) {
    log.warn('MERCADOPAGO_WEBHOOK_SECRET não configurado — verificação de assinatura desativada');
    return true;
  }

  const xSignature = request.headers['x-signature'] as string | undefined;
  const xRequestId = request.headers['x-request-id'] as string | undefined;

  if (!xSignature) {
    log.warn('Webhook recebido sem header x-signature');
    return false;
  }

  // Extrair ts e v1 do header x-signature (formato: "ts=...,v1=...")
  let ts: string | undefined;
  let v1: string | undefined;
  for (const part of xSignature.split(',')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const k = part.slice(0, eqIdx).trim();
    const v = part.slice(eqIdx + 1).trim();
    if (k === 'ts') ts = v;
    if (k === 'v1') v1 = v;
  }

  if (!ts || !v1) {
    log.warn({ xSignature }, 'Header x-signature malformado');
    return false;
  }

  // data.id vem como query param (pode ser numérico — MP exige lowercase para alfanumérico)
  const dataId = ((request.query as Record<string, string>)['data.id'] ?? '').toLowerCase();

  // Construir manifest omitindo partes ausentes
  const manifestParts: string[] = [];
  if (dataId) manifestParts.push(`id:${dataId}`);
  if (xRequestId) manifestParts.push(`request-id:${xRequestId}`);
  manifestParts.push(`ts:${ts}`);
  const manifest = manifestParts.join(';') + ';';

  const computed = createHmac('sha256', secret).update(manifest).digest('hex');

  try {
    const match = timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(v1, 'hex'));
    if (!match) {
      log.warn({ manifest, computed, v1 }, 'Assinatura do webhook inválida');
    }
    return match;
  } catch {
    log.warn({ computed, v1 }, 'Erro ao comparar assinaturas do webhook');
    return false;
  }
}

/**
 * Processa webhook do Mercado Pago.
 * Ref: https://www.mercadopago.com.br/developers/en/docs/your-integrations/notifications/webhooks
 */
export async function handleMercadoPagoWebhook(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // Verificar assinatura antes de processar
  if (!verifyMercadoPagoSignature(request)) {
    log.warn({ ip: request.ip }, 'Webhook rejeitado — assinatura inválida');
    // Responder 200 mesmo assim para não revelar informação ao atacante
    reply.status(200).send({ received: true });
    return;
  }

  // Responder 200 imediatamente (MP aguarda até 22s)
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

    // Buscar detalhes completos do pagamento via API do MP (não confiar no payload do webhook)
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
