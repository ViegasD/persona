import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyAdminAuth } from '../../shared/middleware/auth.js';
import { getFunnelMetrics, getCostMetrics } from './analytics.service.js';
import { prisma } from '../../shared/database/prisma.js';
import { FUNNEL_STATES } from '../funnel/funnel.state-machine.js';
import { trackEvent } from './analytics.service.js';
import { getQueue, QUEUE_NAMES, type DeliveryJobData, type ImageGenerationJobData } from '../../shared/queue/queues.js';
import { buildPrompt } from '../image-gen/prompt.engine.js';

/** Build a relative image URL served by the Next.js admin panel. */
function imageUrl(s3Key: string): string {
  return `/manager/api/images/${s3Key}`;
}

export async function analyticsRouter(app: FastifyInstance): Promise<void> {
  // Todas as rotas admin requerem autenticação
  app.addHook('preHandler', verifyAdminAuth);

  /**
   * GET /api/admin/analytics — Métricas de conversão do funil.
   */
  app.get('/analytics', async (request: FastifyRequest, reply: FastifyReply) => {
    const days = Number((request.query as any).days) || 30;
    const metrics = await getFunnelMetrics(days);
    reply.send(metrics);
  });

  /**
   * GET /api/admin/costs — Tracking de custos Kie.ai.
   */
  app.get('/costs', async (request: FastifyRequest, reply: FastifyReply) => {
    const days = Number((request.query as any).days) || 30;
    const costs = await getCostMetrics(days);
    reply.send(costs);
  });

  /**
   * GET /api/admin/leads — Lista de leads com sessões e imagens geradas.
   */
  app.get('/leads', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string>;
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const status = query.status;

    const where = status ? { status: status as any } : {};

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          sessions: {
            orderBy: { createdAt: 'desc' },
            include: {
              generatedImages: { orderBy: { sequence: 'asc' } },
              payments: { select: { id: true, status: true, amount: true } },
            },
          },
        },
      }),
      prisma.lead.count({ where }),
    ]);

    const data = leads.map((lead) => ({
      ...lead,
      sessions: lead.sessions.map((session) => ({
        ...session,
        generatedImages: session.generatedImages.map((img) => ({
          id: img.id,
          url: imageUrl(img.s3Key),
          thumbnailUrl: img.thumbnailS3Key
            ? imageUrl(img.thumbnailS3Key)
            : null,
          sequence: img.sequence,
          isApproved: img.isApproved,
        })),
      })),
    }));

    reply.send({
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  });

  /**
   * GET /api/admin/leads/:id — Detalhe do lead com imagens presignadas.
   */
  app.get('/leads/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const lead = await prisma.lead.findUnique({
      where: { id: request.params.id },
      include: {
        sessions: {
          include: {
            referenceImages: true,
            generatedImages: { orderBy: { sequence: 'asc' } },
            payments: true,
            deliveries: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!lead) {
      reply.status(404).send({ error: 'Lead não encontrado' });
      return;
    }

    const data = {
      ...lead,
      sessions: lead.sessions.map((session) => ({
        ...session,
        generatedImages: session.generatedImages.map((img) => ({
          id: img.id,
          url: imageUrl(img.s3Key),
          thumbnailUrl: img.thumbnailS3Key
            ? imageUrl(img.thumbnailS3Key)
            : null,
          sequence: img.sequence,
          isApproved: img.isApproved,
        })),
      })),
    };

    reply.send(data);
  });

  /**
   * POST /api/admin/sessions/:sessionId/approve-all — Aprova todas as imagens.
   */
  app.post(
    '/sessions/:sessionId/approve-all',
    async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
      const { sessionId } = request.params;

      const session = await prisma.leadSession.findUnique({
        where: { id: sessionId },
        include: { lead: true, generatedImages: true },
      });

      if (!session) {
        reply.status(404).send({ error: 'Sessão não encontrada' });
        return;
      }

      if (session.generatedImages.length === 0) {
        reply.status(400).send({ error: 'Nenhuma imagem gerada nesta sessão' });
        return;
      }

      const allApproved = session.generatedImages.every((img) => img.isApproved);
      if (allApproved) {
        reply.send({ success: true, message: 'Todas as imagens já estão aprovadas' });
        return;
      }

      // Aprovar todas
      await prisma.generatedImage.updateMany({
        where: { leadSessionId: sessionId },
        data: { isApproved: true },
      });

      await prisma.leadSession.update({
        where: { id: sessionId },
        data: { funnelState: FUNNEL_STATES.APPROVING },
      });

      // Enfileirar entrega
      const payment = await prisma.payment.findFirst({
        where: { leadSessionId: sessionId, status: 'APPROVED' },
      });

      if (payment) {
        const queue = getQueue(QUEUE_NAMES.DELIVERY);
        await queue.add('deliver', {
          leadSessionId: sessionId,
          paymentId: payment.id,
        } satisfies DeliveryJobData);
      }

      await trackEvent(session.leadId, 'IMAGES_APPROVED', {
        selectedCount: session.generatedImages.length,
        totalCount: session.generatedImages.length,
        approvedBy: 'admin',
      });

      reply.send({ success: true, message: `${session.generatedImages.length} imagens aprovadas` });
    },
  );

  /**
   * POST /api/admin/images/:imageId/regenerate — Regenera uma imagem individual.
   */
  app.post(
    '/images/:imageId/regenerate',
    async (request: FastifyRequest<{ Params: { imageId: string } }>, reply: FastifyReply) => {
      const { imageId } = request.params;

      const image = await prisma.generatedImage.findUnique({
        where: { id: imageId },
        include: {
          leadSession: {
            include: { lead: true, referenceImages: true },
          },
        },
      });

      if (!image) {
        reply.status(404).send({ error: 'Imagem não encontrada' });
        return;
      }

      const session = image.leadSession;
      const prefs = session.preferences as Record<string, string>;

      // Criar novo job de geração para 1 imagem
      const genJob = await prisma.generationJob.create({
        data: {
          leadSessionId: session.id,
          prompt: buildPrompt({
            occasion: prefs.occasion ?? 'casual',
            occasionDetails: prefs.occasionDetails,
          }).prompt,
          status: 'QUEUED',
        },
      });

      const queue = getQueue(QUEUE_NAMES.IMAGE_GENERATION);
      await queue.add('regenerate', {
        leadSessionId: session.id,
        generationJobId: genJob.id,
      } satisfies ImageGenerationJobData);

      await trackEvent(session.leadId, 'IMAGE_REGENERATED', {
        imageId,
        generationJobId: genJob.id,
      });

      reply.send({ success: true, generationJobId: genJob.id });
    },
  );
}
