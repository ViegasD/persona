import { Queue, Worker, type Processor, type WorkerOptions } from 'bullmq';
import { getRedisConnection } from './queue.config.js';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('queues');

// ─── Queue Names ────────────────────────────────────────────
export const QUEUE_NAMES = {
  IMAGE_GENERATION: 'image-generation',
  DELIVERY: 'delivery',
  UPSELL: 'upsell',
  ANALYTICS: 'analytics',
  WHATSAPP_SEND: 'whatsapp-send',
  MESSAGE_BATCH: 'message-batch',
} as const;

// ─── Queue Instances ────────────────────────────────────────
const queues = new Map<string, Queue>();

export function getQueue(name: string): Queue {
  if (!queues.has(name)) {
    const queue = new Queue(name, {
      connection: getRedisConnection() as any,
      defaultJobOptions: {
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    });
    queues.set(name, queue);
    log.info({ queue: name }, 'Fila criada');
  }
  return queues.get(name)!;
}

// ─── Type-safe Job Data ─────────────────────────────────────

export interface ImageGenerationJobData {
  leadSessionId: string;
  generationJobId: string;
}

export interface DeliveryJobData {
  leadSessionId: string;
  paymentId: string;
}

export interface UpsellJobData {
  leadId: string;
  leadSessionId: string;
  type: 'follow_up' | 'reengagement';
  attempt: number;
}

export interface AnalyticsJobData {
  leadId?: string;
  eventType: string;
  metadata?: Record<string, unknown>;
}

export interface WhatsAppSendJobData {
  phone: string;
  type: 'text' | 'media' | 'reaction';
  payload: Record<string, unknown>;
}

export interface MessageBatchJobData {
  phone: string;
  leadId: string;
}

// ─── Worker Factory ─────────────────────────────────────────

export function createWorker<T>(
  queueName: string,
  processor: Processor<T>,
  opts?: Partial<WorkerOptions>,
): Worker<T> {
  const worker = new Worker<T>(queueName, processor, {
    connection: getRedisConnection() as any,
    concurrency: 1,
    ...opts,
  });

  worker.on('completed', (job) => {
    log.debug({ queue: queueName, jobId: job.id }, 'Job concluído');
  });

  worker.on('failed', (job, err) => {
    log.error({ queue: queueName, jobId: job?.id, err: err.message }, 'Job falhou');
  });

  log.info({ queue: queueName, concurrency: opts?.concurrency ?? 1 }, 'Worker iniciado');
  return worker;
}

// ─── Cleanup ────────────────────────────────────────────────

export async function closeQueues(): Promise<void> {
  for (const [name, queue] of queues) {
    await queue.close();
    log.debug({ queue: name }, 'Fila fechada');
  }
  queues.clear();
}
