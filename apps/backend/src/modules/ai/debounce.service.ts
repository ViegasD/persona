import { getRedisConnection } from '../../shared/queue/queue.config.js';
import { getQueue, QUEUE_NAMES, type MessageBatchJobData } from '../../shared/queue/queues.js';
import { env } from '../../shared/config/env.js';
import { createChildLogger } from '../../shared/utils/logger.js';

const log = createChildLogger('debounce');

const DEBOUNCE_KEY_PREFIX = 'debounce:';

/**
 * Debounces funnel message processing.
 * Each new message resets the 12-second timer. When the timer fires,
 * all accumulated messages since the last bot response are batched together.
 */
export async function debounceFunnelMessage(
  phone: string,
  leadId: string,
): Promise<void> {
  const redis = getRedisConnection();
  const debounceKey = `${DEBOUNCE_KEY_PREFIX}${phone}`;
  const jobId = `batch_${phone}`;

  // Update timestamp in Redis
  await redis.set(debounceKey, Date.now().toString(), 'PX', env.MESSAGE_DEBOUNCE_MS + 5_000);

  // Remove existing delayed job if present
  const queue = getQueue(QUEUE_NAMES.MESSAGE_BATCH);
  const existingJob = await queue.getJob(jobId);
  if (existingJob) {
    const state = await existingJob.getState();
    if (state === 'delayed' || state === 'waiting') {
      await existingJob.remove();
      log.debug({ phone }, 'Removed previous debounce job');
    }
  }

  // Add new delayed job
  await queue.add(
    'process-batch',
    { phone, leadId } satisfies MessageBatchJobData,
    {
      jobId,
      delay: env.MESSAGE_DEBOUNCE_MS,
      removeOnComplete: true,
      removeOnFail: { count: 100 },
      attempts: 2,
      backoff: { type: 'fixed', delay: 3_000 },
    },
  );

  log.debug({ phone, delayMs: env.MESSAGE_DEBOUNCE_MS }, 'Debounce job scheduled');
}
