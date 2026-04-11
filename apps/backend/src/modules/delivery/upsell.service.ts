import type { Job } from 'bullmq';
import type { UpsellJobData } from '../../shared/queue/queues.js';
import { prisma } from '../../shared/database/prisma.js';
import { queueTextMessage, logOutboundMessage } from '../whatsapp/whatsapp.service.js';
import { MESSAGES } from '../funnel/messages.templates.js';
import { trackEvent } from '../analytics/analytics.service.js';
import { createChildLogger } from '../../shared/utils/logger.js';

const log = createChildLogger('upsell-service');

/**
 * Worker BullMQ que processa jobs de upsell / reengajamento.
 */
export async function processUpsell(job: Job<UpsellJobData>): Promise<void> {
  const { leadId, leadSessionId, type, attempt } = job.data;

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) {
    log.warn({ leadId }, 'Lead não encontrado para upsell');
    return;
  }

  const name = lead.name ?? 'cliente';

  if (type === 'follow_up') {
    const msg = MESSAGES.upsellFollowUp(name);
    await queueTextMessage(lead.phone, msg);
    await logOutboundMessage(leadId, msg);
    await trackEvent(leadId, 'UPSELL_SENT', { type, attempt });
    log.info({ leadId, type }, 'Upsell follow-up enviado');
  } else if (type === 'reengagement') {
    const reMsg = MESSAGES.reengagement(name, 0);
    await queueTextMessage(lead.phone, reMsg);
    await logOutboundMessage(leadId, reMsg);
    await trackEvent(leadId, 'REENGAGEMENT_SENT', { type, attempt });
    log.info({ leadId, type, attempt }, 'Reengagement enviado');
  }
}

/**
 * Agenda upsell follow-up 24h após entrega.
 */
export async function scheduleFollowUpUpsell(
  leadId: string,
  leadSessionId: string,
): Promise<void> {
  const { getQueue, QUEUE_NAMES } = await import('../../shared/queue/queues.js');
  const queue = getQueue(QUEUE_NAMES.UPSELL);

  await queue.add(
    'follow-up',
    { leadId, leadSessionId, type: 'follow_up', attempt: 1 } satisfies UpsellJobData,
    { delay: 24 * 60 * 60 * 1000 }, // 24h
  );

  log.info({ leadId }, 'Follow-up agendado para 24h');
}

/**
 * Agenda reengajamento para leads que não pagaram.
 */
export async function scheduleReengagement(
  leadId: string,
  leadSessionId: string,
  attempt: number = 1,
): Promise<void> {
  const { getQueue, QUEUE_NAMES } = await import('../../shared/queue/queues.js');
  const queue = getQueue(QUEUE_NAMES.UPSELL);

  if (attempt > 3) {
    log.info({ leadId }, 'Limite de tentativas de reengagement atingido');
    return;
  }

  const delays = [
    4 * 60 * 60 * 1000,  // 4h
    24 * 60 * 60 * 1000, // 24h
    48 * 60 * 60 * 1000, // 48h
  ];

  await queue.add(
    'reengagement',
    { leadId, leadSessionId, type: 'reengagement', attempt } satisfies UpsellJobData,
    { delay: delays[attempt - 1] },
  );

  log.info({ leadId, attempt }, 'Reengagement agendado');
}
