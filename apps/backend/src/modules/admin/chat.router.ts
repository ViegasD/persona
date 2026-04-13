import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyAdminAuth } from '../../shared/middleware/auth.js';
import { subscribeToChannel, publishEvent } from '../../shared/queue/event-bus.js';
import { prisma } from '../../shared/database/prisma.js';
import { queueTextMessage, logOutboundMessage } from '../whatsapp/whatsapp.service.js';
import { createChildLogger } from '../../shared/utils/logger.js';

const log = createChildLogger('chat-router');

export async function chatRouter(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', verifyAdminAuth);

  // ─── SSE: real-time events ───────────────────────────────
  app.get('/events', { sse: true }, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string>;
    const leadId = query.leadId;

    reply.sse.keepAlive();

    const unsubscribers: Array<() => void> = [];

    // Subscribe to per-lead messages
    if (leadId) {
      const unsub = await subscribeToChannel(`chat:${leadId}`, (payload) => {
        if (!reply.sse.isConnected) return;
        reply.sse.send({ event: 'message', data: payload }).catch(() => {});
      });
      unsubscribers.push(unsub);
    }

    // Always subscribe to lead-list updates
    const unsubLeads = await subscribeToChannel('leads', (payload) => {
      if (!reply.sse.isConnected) return;
      reply.sse.send({ event: 'lead:updated', data: payload }).catch(() => {});
    });
    unsubscribers.push(unsubLeads);

    reply.sse.onClose(() => {
      for (const unsub of unsubscribers) unsub();
      log.debug({ leadId }, 'SSE connection closed');
    });
  });

  // ─── GET messages history ────────────────────────────────
  app.get('/leads/:leadId/messages', async (request: FastifyRequest, reply: FastifyReply) => {
    const { leadId } = request.params as { leadId: string };
    const query = request.query as Record<string, string>;
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
    const before = query.before; // cursor: createdAt ISO string

    const messages = await prisma.conversationMessage.findMany({
      where: {
        leadId,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        direction: true,
        messageType: true,
        content: true,
        metadata: true,
        createdAt: true,
      },
    });

    // Return in chronological order
    return { messages: messages.reverse() };
  });

  // ─── POST send message from admin ────────────────────────
  app.post('/leads/:leadId/messages', async (request: FastifyRequest, reply: FastifyReply) => {
    const { leadId } = request.params as { leadId: string };
    const body = request.body as { content?: string };
    const content = body?.content?.trim();

    if (!content) {
      return reply.status(400).send({ error: 'content is required' });
    }

    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { phone: true } });
    if (!lead) {
      return reply.status(404).send({ error: 'Lead not found' });
    }

    // Queue the WhatsApp message
    await queueTextMessage(lead.phone, content);
    // Log (this also publishes the SSE event via event-bus)
    await logOutboundMessage(leadId, content, 'text');

    log.info({ leadId, contentLen: content.length }, 'Admin sent message');
    return { success: true };
  });

  // ─── PUT AI toggle ───────────────────────────────────────
  app.put('/leads/:leadId/ai', async (request: FastifyRequest, reply: FastifyReply) => {
    const { leadId } = request.params as { leadId: string };
    const body = request.body as { enabled?: boolean };

    if (typeof body?.enabled !== 'boolean') {
      return reply.status(400).send({ error: 'enabled (boolean) is required' });
    }

    const session = await prisma.leadSession.findFirst({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
    });
    if (!session) {
      return reply.status(404).send({ error: 'No session found for this lead' });
    }

    await prisma.leadSession.update({
      where: { id: session.id },
      data: { aiEnabled: body.enabled },
    });

    // Notify connected admin UIs
    await publishEvent(`chat:${leadId}`, {
      event: 'ai:toggled', leadId, enabled: body.enabled,
    }).catch(() => {});

    log.info({ leadId, enabled: body.enabled }, 'AI toggle updated');
    return { success: true, aiEnabled: body.enabled };
  });
}
