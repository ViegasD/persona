import { prisma } from '../../shared/database/prisma.js';
import type { LlmMessage } from './llm.client.js';

/**
 * Builds the conversation history for the LLM from the database.
 * Returns the last `limit` messages as OpenAI-compatible chat messages.
 */
export async function buildConversationContext(
  leadId: string,
  limit: number = 20,
  since?: Date,
): Promise<LlmMessage[]> {
  const dbMessages = await prisma.conversationMessage.findMany({
    where: { leadId, ...(since ? { createdAt: { gte: since } } : {}) },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: {
      direction: true,
      content: true,
      messageType: true,
    },
  });

  return dbMessages.map((m) => ({
    role: m.direction === 'INBOUND' ? 'user' as const : 'assistant' as const,
    content: m.messageType === 'text'
      ? m.content
      : `[${m.messageType}: ${m.content}]`,
  }));
}

/**
 * Gets the count of new inbound messages since the last outbound message.
 * Used by the debounce service to batch messages.
 */
export async function getUnprocessedInboundMessages(
  leadId: string,
): Promise<string[]> {
  // Find the last outbound message timestamp
  const lastOutbound = await prisma.conversationMessage.findFirst({
    where: { leadId, direction: 'OUTBOUND' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  const where: any = {
    leadId,
    direction: 'INBOUND',
  };

  if (lastOutbound) {
    where.createdAt = { gt: lastOutbound.createdAt };
  }

  const messages = await prisma.conversationMessage.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    select: { content: true },
  });

  return messages.map((m) => m.content);
}
