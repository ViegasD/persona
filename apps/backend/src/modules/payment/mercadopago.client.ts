import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import { env } from '../../shared/config/env.js';
import { createChildLogger } from '../../shared/utils/logger.js';

const log = createChildLogger('mercadopago-client');

const client = new MercadoPagoConfig({
  accessToken: env.MERCADOPAGO_ACCESS_TOKEN,
});

const preferenceApi = new Preference(client);
const paymentApi = new Payment(client);

/**
 * Cria uma preferência de pagamento (Checkout Pro).
 */
export async function createCheckoutPreference(params: {
  title: string;
  description: string;
  amount: number;
  externalReference: string;
  payerEmail?: string;
  backUrls: {
    success: string;
    failure: string;
    pending: string;
  };
  notificationUrl: string;
}): Promise<{ preferenceId: string; checkoutUrl: string }> {
  log.info({ externalReference: params.externalReference, amount: params.amount }, 'Criando preferência MP');

  const preference = await preferenceApi.create({
    body: {
      items: [
        {
          id: params.externalReference,
          title: params.title,
          description: params.description,
          quantity: 1,
          unit_price: params.amount,
          currency_id: 'BRL',
        },
      ],
      external_reference: params.externalReference,
      ...(params.backUrls.success.startsWith('https')
        ? { back_urls: params.backUrls, auto_return: 'approved' as const }
        : { back_urls: params.backUrls }),
      notification_url: params.notificationUrl,
      payment_methods: {
        installments: 3,
      },
      expires: true,
      expiration_date_from: new Date().toISOString(),
      expiration_date_to: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
  });

  const preferenceId = preference.id!;
  const checkoutUrl = preference.init_point!;

  log.info({ preferenceId, checkoutUrl }, 'Preferência criada');

  return { preferenceId, checkoutUrl };
}

/**
 * Cria um pagamento Pix via API de Pagamentos.
 * Retorna o QR code, copia-e-cola e ticket URL.
 */
export async function createPixPayment(params: {
  amount: number;
  description: string;
  externalReference: string;
  notificationUrl: string;
}): Promise<{
  paymentId: string;
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl: string;
}> {
  log.info({ externalReference: params.externalReference, amount: params.amount }, '[PIX] Criando pagamento Pix');

  const expirationDate = new Date(Date.now() + 30 * 60 * 1000); // 30 min

  const payment = await paymentApi.create({
    body: {
      transaction_amount: params.amount,
      payment_method_id: 'pix',
      description: params.description,
      external_reference: params.externalReference,
      notification_url: params.notificationUrl,
      payer: {
        email: 'cliente@persona.com.br',
      },
      date_of_expiration: expirationDate.toISOString(),
    },
  });

  const transactionData = payment.point_of_interaction?.transaction_data;

  const result = {
    paymentId: payment.id!.toString(),
    qrCode: transactionData?.qr_code ?? '',
    qrCodeBase64: transactionData?.qr_code_base64 ?? '',
    ticketUrl: transactionData?.ticket_url ?? '',
  };

  log.info({ paymentId: result.paymentId, hasQrCode: !!result.qrCode }, '[PIX] Pagamento Pix criado');

  return result;
}

/**
 * Busca detalhes de um pagamento pelo ID.
 */
export async function getPaymentDetails(paymentId: string) {
  const payment = await paymentApi.get({ id: paymentId });
  return {
    id: payment.id?.toString(),
    status: payment.status,
    externalReference: payment.external_reference,
    paymentMethod: payment.payment_method_id,
    amount: payment.transaction_amount,
    paidAt: payment.date_approved,
  };
}
