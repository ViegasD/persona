import type { Job } from 'bullmq';
import type { AnalyticsJobData } from '../../shared/queue/queues.js';
import { prisma } from '../../shared/database/prisma.js';
import { getQueue, QUEUE_NAMES } from '../../shared/queue/queues.js';
import { createChildLogger } from '../../shared/utils/logger.js';

const log = createChildLogger('analytics-service');

/**
 * Enfileira evento de analytics (não bloqueia o fluxo principal).
 */
export async function trackEvent(
  leadId: string | undefined,
  eventType: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    const queue = getQueue(QUEUE_NAMES.ANALYTICS);
    await queue.add('track', {
      leadId,
      eventType,
      metadata,
    } satisfies AnalyticsJobData);
  } catch (err) {
    // Analytics nunca deve derrubar o fluxo principal
    log.warn({ err, eventType }, 'Falha ao enfileirar evento de analytics');
  }
}

/**
 * Worker BullMQ que persiste eventos de analytics no banco.
 */
export async function processAnalytics(job: Job<AnalyticsJobData>): Promise<void> {
  const { leadId, eventType, metadata } = job.data;

  await prisma.analyticsEvent.create({
    data: {
      leadId: leadId ?? null,
      eventType,
      metadata: (metadata ?? {}) as any,
    },
  });

  log.debug({ eventType, leadId }, 'Evento registrado');
}

// ─── Consultas para Admin Dashboard ────────────────────────

/**
 * Métricas de conversão por etapa do funil.
 */
export async function getFunnelMetrics(days: number = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const events = await prisma.analyticsEvent.groupBy({
    by: ['eventType'],
    _count: true,
    where: { createdAt: { gte: since } },
    orderBy: { _count: { eventType: 'desc' } },
  });

  const totalLeads = await prisma.lead.count({
    where: { createdAt: { gte: since } },
  });

  const paidLeads = await prisma.lead.count({
    where: { createdAt: { gte: since }, status: { in: ['PAID', 'GENERATING', 'APPROVING', 'DELIVERED'] } },
  });

  const deliveredLeads = await prisma.lead.count({
    where: { createdAt: { gte: since }, status: 'DELIVERED' },
  });

  return {
    period: `${days}d`,
    totalLeads,
    paidLeads,
    deliveredLeads,
    conversionRate: totalLeads > 0 ? ((paidLeads / totalLeads) * 100).toFixed(1) + '%' : '0%',
    deliveryRate: paidLeads > 0 ? ((deliveredLeads / paidLeads) * 100).toFixed(1) + '%' : '0%',
    events: events.map((e) => ({ type: e.eventType, count: e._count })),
  };
}

/**
 * Custo estimado com Kie.ai (baseado em jobs completos).
 */
export async function getCostMetrics(days: number = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const jobs = await prisma.generationJob.findMany({
    where: { createdAt: { gte: since }, status: 'COMPLETED' },
    select: { costCredits: true },
  });

  const totalCost = jobs.reduce(
    (sum, j) => sum + (j.costCredits?.toNumber() ?? 0),
    0,
  );

  return {
    period: `${days}d`,
    completedJobs: jobs.length,
    estimatedCost: totalCost,
  };
}
