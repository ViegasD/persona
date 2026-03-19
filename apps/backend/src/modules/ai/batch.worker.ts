import type { Job } from 'bullmq';
import type { MessageBatchJobData } from '../../shared/queue/queues.js';
import { createChildLogger } from '../../shared/utils/logger.js';
import { handleFunnelBatch } from '../funnel/funnel.service.js';

const log = createChildLogger('batch-worker');

/**
 * Worker processor for the MESSAGE_BATCH queue.
 * Fires after the debounce window (12s) — processes all accumulated messages.
 */
export async function processMessageBatch(
  job: Job<MessageBatchJobData>,
): Promise<void> {
  const { phone, leadId } = job.data;
  log.info({ phone, leadId, jobId: job.id, attempt: job.attemptsMade + 1 }, '[WORKER] ▶ Processing message batch');

  try {
    await handleFunnelBatch(phone, leadId);
    log.info({ phone, jobId: job.id }, '[WORKER] ✅ Batch completed');
  } catch (error) {
    log.error(error, '[WORKER] ❌ Batch failed');
    throw error; // re-throw so BullMQ retries
  }
}
