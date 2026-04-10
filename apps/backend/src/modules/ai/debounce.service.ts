import { getRedisConnection } from '../../shared/queue/queue.config.js';
import { getQueue, QUEUE_NAMES, type MessageBatchJobData } from '../../shared/queue/queues.js';
import { getSettingNumber, SETTING_KEYS } from '../admin/settings.service.js';
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
  const primaryJobId = `batch_${phone}`;
  let effectiveJobId = primaryJobId;

  const debounceMs = await getSettingNumber(SETTING_KEYS.MESSAGE_DEBOUNCE_MS);

  // Update timestamp in Redis
  await redis.set(debounceKey, Date.now().toString(), 'PX', debounceMs + 5_000);

  const queue = getQueue(QUEUE_NAMES.MESSAGE_BATCH);

  // Check primary job
  const existingJob = await queue.getJob(primaryJobId);
  if (existingJob) {
    const state = await existingJob.getState();
    if (state === 'delayed' || state === 'waiting') {
      await existingJob.remove();
      log.debug({ phone }, 'Removed previous debounce job');
    } else if (state === 'active') {
      // Batch is currently processing — use alternate jobId to avoid BullMQ dedup
      effectiveJobId = `${primaryJobId}_next`;
      const nextJob = await queue.getJob(effectiveJobId);
      if (nextJob) {
        const nextState = await nextJob.getState();
        if (nextState === 'delayed' || nextState === 'waiting') {
          await nextJob.remove();
        }
      }
      log.info({ phone }, 'Batch active — scheduling follow-up debounce');
    }
  }

  // Add new delayed job
  await queue.add(
    'process-batch',
    { phone, leadId } satisfies MessageBatchJobData,
    {
      jobId: effectiveJobId,
      delay: debounceMs,
      removeOnComplete: true,
      removeOnFail: { count: 100 },
      attempts: 2,
      backoff: { type: 'fixed', delay: 3_000 },
    },
  );

  log.debug({ phone, delayMs: debounceMs, jobId: effectiveJobId }, 'Debounce job scheduled');
}
