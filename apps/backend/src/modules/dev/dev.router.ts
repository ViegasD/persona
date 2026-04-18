import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/database/prisma.js';
import { handleFunnelBatch } from '../funnel/funnel.service.v2.js';
import { handlePaymentApproved, triggerImageGeneration } from '../payment/payment.service.js';
import { createChildLogger } from '../../shared/utils/logger.js';
import { env } from '../../shared/config/env.js';

const log = createChildLogger('dev-router');

/**
 * Rotas de desenvolvimento — simulam mensagens sem Evolution API.
 * Em produção, protegidas por x-api-key header.
 */
export async function devRouter(app: FastifyInstance) {
  // In production, require API key
  if (env.NODE_ENV === 'production') {
    app.addHook('preHandler', async (request, reply) => {
      if (request.headers['x-api-key'] !== env.EVOLUTION_API_KEY) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
    });
  }

  app.post<{
    Body: { phone: string; text: string; mediaType?: string };
  }>('/simulate', async (request, reply) => {
    const { phone, text, mediaType } = request.body;

    if (!phone || !text) {
      return reply.status(400).send({ error: 'phone and text are required' });
    }

    // Buscar ou criar lead
    let lead = await prisma.lead.findUnique({ where: { phone } });
    if (!lead) {
      lead = await prisma.lead.create({
        data: { phone, status: 'NEW' },
      });
    }

    // Buscar ou criar sessão
    let session = await prisma.leadSession.findFirst({
      where: { leadId: lead.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!session) {
      session = await prisma.leadSession.create({
        data: {
          leadId: lead.id,
          funnelState: 'CONVERSATION',
          preferences: {},
        },
      });
    }

    // Salvar mensagem inbound
    await prisma.conversationMessage.create({
      data: {
        leadId: lead.id,
        direction: 'INBOUND',
        messageType: mediaType ?? 'text',
        content: text,
        metadata: { simulated: true },
      },
    });

    log.info({ phone, text }, 'Mensagem simulada recebida');

    // Processar diretamente (sem debounce) para feedback rápido
    await handleFunnelBatch(phone, lead.id);

    // Buscar mensagens outbound recentes para retornar como resposta
    const replies = await prisma.conversationMessage.findMany({
      where: {
        leadId: lead.id,
        direction: 'OUTBOUND',
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    return {
      leadId: lead.id,
      sessionId: session.id,
      state: session.funnelState,
      replies: replies.reverse().map((r) => ({
        body: r.content,
        createdAt: r.createdAt,
      })),
    };
  });

  app.delete<{
    Params: { phone: string };
  }>('/reset/:phone', async (request, reply) => {
    const { phone } = request.params;
    if (!phone) {
      return reply.status(400).send({ error: 'phone is required' });
    }

    const lead = await prisma.lead.findUnique({ where: { phone } });
    if (!lead) {
      return reply.status(404).send({ error: 'Lead not found' });
    }

    // Delete all related data (cascade handles sessions, images, etc.)
    await prisma.conversationMessage.deleteMany({ where: { leadId: lead.id } });
    await prisma.lead.delete({ where: { id: lead.id } });

    log.info({ phone }, 'Lead reset — all data deleted');
    return { ok: true, phone, deletedLeadId: lead.id };
  });

  // ─── Debug: inspect lead state, photos, and conversation ──
  app.get<{
    Params: { phone: string };
  }>('/debug/:phone', async (request, reply) => {
    const { phone } = request.params;
    const lead = await prisma.lead.findUnique({ where: { phone } });
    if (!lead) {
      return reply.status(404).send({ error: 'Lead not found' });
    }

    const session = await prisma.leadSession.findFirst({
      where: { leadId: lead.id },
      orderBy: { createdAt: 'desc' },
    });

    const photoCount = session
      ? await prisma.referenceImage.count({ where: { leadSessionId: session.id } })
      : 0;

    const photos = session
      ? await prisma.referenceImage.findMany({
          where: { leadSessionId: session.id },
          select: { id: true, s3Key: true, mimeType: true, fileSize: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        })
      : [];

    const messages = await prisma.conversationMessage.findMany({
      where: { leadId: lead.id },
      orderBy: { createdAt: 'asc' },
      select: { direction: true, content: true, messageType: true, createdAt: true },
    });

    const payments = session
      ? await prisma.payment.findMany({
          where: { leadSessionId: session.id },
          select: { id: true, status: true, amount: true, createdAt: true },
        })
      : [];

    const generationJobs = session
      ? await prisma.generationJob.findMany({
          where: { leadSessionId: session.id },
          select: { id: true, status: true, prompt: true, errorMessage: true, externalJobId: true, createdAt: true, completedAt: true },
          orderBy: { createdAt: 'desc' },
        })
      : [];

    const generatedImages = session
      ? await prisma.generatedImage.findMany({
          where: { generationJob: { leadSessionId: session.id } },
          select: { id: true, s3Key: true, s3Url: true, isApproved: true, sequence: true, createdAt: true },
          orderBy: { sequence: 'asc' },
        })
      : [];

    return {
      lead: { id: lead.id, name: lead.name, phone: lead.phone, status: lead.status },
      session: session
        ? { id: session.id, funnelState: session.funnelState, preferences: session.preferences }
        : null,
      photoCount,
      photos,
      payments,
      generationJobs,
      generatedImages,
      messages: messages.map((m) => ({
        direction: m.direction,
        type: m.messageType,
        content: m.content.substring(0, 200),
        at: m.createdAt,
      })),
    };
  });

  // ─── Dev: manually confirm payment (MP webhooks can't reach localhost) ──
  app.post<{
    Params: { phone: string };
  }>('/confirm-payment/:phone', async (request, reply) => {
    const { phone } = request.params;
    const lead = await prisma.lead.findUnique({ where: { phone } });
    if (!lead) {
      return reply.status(404).send({ error: 'Lead not found' });
    }

    const session = await prisma.leadSession.findFirst({
      where: { leadId: lead.id },
      orderBy: { createdAt: 'desc' },
    });

    if (!session || session.funnelState !== 'AWAITING_PAYMENT') {
      return reply.status(400).send({
        error: 'Session not in AWAITING_PAYMENT state',
        currentState: session?.funnelState ?? 'no session',
      });
    }

    const payment = await prisma.payment.findFirst({
      where: { leadSessionId: session.id, status: 'PENDING' },
    });

    if (!payment) {
      return reply.status(400).send({ error: 'No pending payment found' });
    }

    const externalReference = `persona_${session.id}`;
    const fakePaymentId = payment.mercadopagoPaymentId ?? `dev_manual_${Date.now()}`;

    await handlePaymentApproved(
      fakePaymentId,
      externalReference,
      'pix',
      Number(payment.amount),
      new Date().toISOString(),
    );

    log.info({ phone, paymentId: payment.id, sessionId: session.id }, 'Dev: payment manually confirmed');

    return {
      ok: true,
      phone,
      paymentId: payment.id,
      sessionId: session.id,
      message: 'Payment confirmed → PAID → generation triggered',
    };
  });

  // ─── Dev: retry failed generation (after topping up Kie.ai credits) ──
  app.post<{
    Params: { phone: string };
  }>('/retry-generation/:phone', async (request, reply) => {
    const { phone } = request.params;
    const lead = await prisma.lead.findUnique({ where: { phone } });
    if (!lead) {
      return reply.status(404).send({ error: 'Lead not found' });
    }

    const session = await prisma.leadSession.findFirst({
      where: { leadId: lead.id },
      orderBy: { createdAt: 'desc' },
    });

    if (!session || session.funnelState !== 'PAID') {
      return reply.status(400).send({
        error: 'Session not in PAID state (generation retry only works after failed generation)',
        currentState: session?.funnelState ?? 'no session',
      });
    }

    // Verify there's an approved payment
    const payment = await prisma.payment.findFirst({
      where: { leadSessionId: session.id, status: 'APPROVED' },
    });
    if (!payment) {
      return reply.status(400).send({ error: 'No approved payment found' });
    }

    await triggerImageGeneration(session.id);

    log.info({ phone, sessionId: session.id }, 'Dev: generation retried');

    return {
      ok: true,
      phone,
      sessionId: session.id,
      message: 'Generation job re-queued',
    };
  });
}
