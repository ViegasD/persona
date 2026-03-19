import type { Job } from 'bullmq';
import type { DeliveryJobData } from '../../shared/queue/queues.js';
import { deliverApprovedImages } from './delivery.service.js';
import { createChildLogger } from '../../shared/utils/logger.js';

const log = createChildLogger('delivery-worker');

/**
 * Worker BullMQ que processa jobs de entrega de imagens.
 */
export async function processDelivery(job: Job<DeliveryJobData>): Promise<void> {
  const { leadSessionId, paymentId } = job.data;
  log.info({ leadSessionId, paymentId, jobId: job.id }, 'Iniciando entrega');

  await deliverApprovedImages(leadSessionId, paymentId);

  log.info({ leadSessionId }, 'Job de entrega concluído');
}
