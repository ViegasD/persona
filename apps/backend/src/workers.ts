import { createChildLogger } from './shared/utils/logger.js';
import { createWorker, QUEUE_NAMES } from './shared/queue/queues.js';
import type {
  ImageGenerationJobData,
  VideoGenerationJobData,
  DeliveryJobData,
  UpsellJobData,
  AnalyticsJobData,
  WhatsAppSendJobData,
  MessageBatchJobData,
} from './shared/queue/queues.js';
import { processImageGeneration } from './modules/image-gen/image-gen.worker.js';
import { processVideoGeneration } from './modules/video-gen/video-gen.worker.js';
import { processDelivery } from './modules/delivery/delivery.worker.js';
import { processUpsell } from './modules/delivery/upsell.service.js';
import { processAnalytics } from './modules/analytics/analytics.service.js';
import { processWhatsAppSend } from './modules/whatsapp/whatsapp.service.js';
import { processMessageBatch } from './modules/ai/batch.worker.js';
import type { Worker } from 'bullmq';

const log = createChildLogger('workers');

const workers: Worker[] = [];

export function startWorkers(): void {
  log.info('Iniciando workers...');

  workers.push(
    createWorker<ImageGenerationJobData>(
      QUEUE_NAMES.IMAGE_GENERATION,
      processImageGeneration,
      { concurrency: 3, limiter: { max: 10, duration: 60_000 } },
    ),
  );

  workers.push(
    createWorker<VideoGenerationJobData>(
      QUEUE_NAMES.VIDEO_GENERATION,
      processVideoGeneration,
      { concurrency: 3, limiter: { max: 10, duration: 60_000 } },
    ),
  );

  workers.push(
    createWorker<DeliveryJobData>(
      QUEUE_NAMES.DELIVERY,
      processDelivery,
      { concurrency: 5 },
    ),
  );

  workers.push(
    createWorker<UpsellJobData>(
      QUEUE_NAMES.UPSELL,
      processUpsell,
      { concurrency: 2 },
    ),
  );

  workers.push(
    createWorker<AnalyticsJobData>(
      QUEUE_NAMES.ANALYTICS,
      processAnalytics,
      { concurrency: 10 },
    ),
  );

  workers.push(
    createWorker<WhatsAppSendJobData>(
      QUEUE_NAMES.WHATSAPP_SEND,
      processWhatsAppSend,
      { concurrency: 10, limiter: { max: 60, duration: 60_000 } },
    ),
  );

  workers.push(
    createWorker<MessageBatchJobData>(
      QUEUE_NAMES.MESSAGE_BATCH,
      processMessageBatch,
      { concurrency: 10 },
    ),
  );

  log.info({ count: workers.length }, 'Workers iniciados');
}

export async function stopWorkers(): Promise<void> {
  for (const worker of workers) {
    await worker.close();
  }
  workers.length = 0;
  log.info('Workers parados');
}
