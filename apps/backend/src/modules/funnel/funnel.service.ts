import { prisma } from '../../shared/database/prisma.js';
import { createChildLogger } from '../../shared/utils/logger.js';
import { queueTextMessage, queueMediaMessage, logOutboundMessage } from '../whatsapp/whatsapp.service.js';
import { initiatePixPayment } from '../payment/payment.service.js';
import { trackEvent } from '../analytics/analytics.service.js';
import {
  FUNNEL_STATES,
  canTransition,
  getAgentForState,
  getNextState,
  type FunnelState,
} from './funnel.state-machine.js';
import { MESSAGES } from './messages.templates.js';
import { callLlmJson } from '../ai/llm.client.js';
import { buildConversationContext, getUnprocessedInboundMessages } from '../ai/conversation.context.js';
import type { AgentResponse, AgentConfig } from '../ai/agents/base.js';
import { buildLeadContext } from '../ai/agents/base.js';
import { engagementAgent } from '../ai/agents/engagement.agent.js';
import { photoCollectionAgent } from '../ai/agents/photo-collection.agent.js';
import { paymentAgent } from '../ai/agents/payment.agent.js';
import { supportAgent } from '../ai/agents/support.agent.js';
import { reengagementAgent } from '../ai/agents/reengagement.agent.js';

const log = createChildLogger('funnel-service');

const AGENTS: Record<string, AgentConfig> = {
  engagement: engagementAgent,
  'photo-collection': photoCollectionAgent,
  payment: paymentAgent,
  support: supportAgent,
  reengagement: reengagementAgent,
};

/**
 * Main entry point called by the batch worker after debounce completes.
 * Loads conversation context, selects the right agent, calls the LLM,
 * and applies the result.
 */
export async function handleFunnelBatch(phone: string, leadId: string): Promise<void> {
  log.info({ phone, leadId }, '[BATCH:START] Processing funnel batch');

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) {
    log.warn({ leadId }, '[BATCH] Lead não encontrado');
    return;
  }

  // Get or create session
  let session = await prisma.leadSession.findFirst({
    where: { leadId: lead.id },
    orderBy: { createdAt: 'desc' },
  });

  if (!session) {
    session = await prisma.leadSession.create({
      data: { leadId: lead.id, funnelState: FUNNEL_STATES.ENGAGING },
    });
    log.info({ sessionId: session.id }, '[BATCH] New session created');
    await trackEvent(lead.id, 'LEAD_CREATED', { source: lead.source });
  }

  // Migrate old states to new state machine
  const state = migrateState(session.funnelState) as FunnelState;
  if (state !== session.funnelState) {
    log.info({ old: session.funnelState, new: state }, '[BATCH] Migrated state');
    await prisma.leadSession.update({
      where: { id: session.id },
      data: { funnelState: state },
    });
  }

  const photoCount = await prisma.referenceImage.count({
    where: { leadSessionId: session.id },
  });

  const prefs = (session.preferences as Record<string, unknown>) ?? {};

  log.info(
    { phone, state, leadId, sessionId: session.id, photoCount, prefs },
    '[BATCH:CONTEXT] Loaded lead context',
  );

  // ─── Step 1: LLM Agent Call ──────────────────────────────
  let agentResponse: AgentResponse;
  let agentName: string;
  try {
    // Select agent
    agentName = getAgentForState(state);
    const agent = AGENTS[agentName];
    if (!agent) {
      log.error({ agentName, state }, '[BATCH:AGENT] Agent not found');
      await queueTextMessage(phone, MESSAGES.errorOccurred());
      return;
    }

    log.info({ agentName, state }, '[BATCH:AGENT] Selected agent');

    // Build context
    const conversationHistory = await buildConversationContext(leadId);
    log.info(
      { messageCount: conversationHistory.length, roles: conversationHistory.map((m) => m.role) },
      '[BATCH:HISTORY] Conversation history loaded',
    );

    const leadContext = buildLeadContext(
      { name: lead.name, phone: lead.phone },
      { preferences: prefs, photoCount },
    );

    const stateContext = `\n--- ESTADO ATUAL: ${state} ---`;

    const systemMessage = agent.systemPrompt + '\n\n' + leadContext + stateContext;

    // Call LLM
    log.info({ agentName }, '[BATCH:LLM] Calling LLM...');
    const { data } = await callLlmJson<AgentResponse>(
      [
        { role: 'system', content: systemMessage },
        ...conversationHistory,
      ],
      { leadId: lead.id, agentName },
    );
    agentResponse = data;

    log.info(
      {
        agentName,
        shouldTransition: agentResponse.shouldTransition,
        messages: agentResponse.messages?.length,
        extractedData: agentResponse.extractedData,
        reasoning: agentResponse.reasoning,
      },
      '[BATCH:LLM] Agent response received',
    );

    // Apply extracted data to session preferences
    if (agentResponse.extractedData && Object.keys(agentResponse.extractedData).length > 0) {
      log.info({ extractedData: agentResponse.extractedData }, '[BATCH:DATA] Applying extracted data');
      await applyExtractedData(session.id, lead.id, agentResponse.extractedData);
    }

    // Send messages with staggered delays to preserve ordering
    let stagger = 0;
    for (const msg of agentResponse.messages) {
      if (msg.trim()) {
        await queueTextMessage(phone, msg, stagger > 0 ? { jobDelay: stagger } : undefined);
        // 1.5–3.5s between bubbles to mimic human typing
        stagger += 1500 + Math.floor(Math.random() * 2000);
      }
    }

    // Save all bubbles as ONE assistant message so the LLM sees its own history
    const fullReply = agentResponse.messages.filter((m) => m.trim()).join('\n\n');
    if (fullReply) {
      await logOutboundMessage(lead.id, fullReply);
    }

    log.info(
      { messageBubbles: agentResponse.messages.filter((m) => m.trim()).length },
      '[BATCH:SEND] Messages sent and logged',
    );
  } catch (error) {
    log.error(error, '[BATCH:ERROR] Erro na chamada LLM / envio de mensagens');
    // Fallback to template message — LLM failed, nothing was sent
    await handleFallback(phone, lead.id, state);
    return;
  }

  // ─── Step 2: State Transition (separate try/catch) ───────
  if (agentResponse.shouldTransition) {
    try {
      log.info({ from: state, sessionId: session.id }, '[BATCH:TRANSITION] Starting transition...');
      await handleTransition(session.id, lead.id, phone, state, agentResponse.extractedData ?? {});
      log.info({ from: state }, '[BATCH:TRANSITION] Transition completed successfully');
    } catch (error) {
      log.error(error, '[BATCH:TRANSITION:ERROR] Transition failed (messages already sent)');
      // Messages were already sent — do NOT re-send fallback templates.
      // Send a specific error message so the client isn't left hanging.
      const errorMsg = '⚠️ Tive um probleminha técnico aqui, mas já estou resolvendo! Vou te chamar em instantes, tá? 😊';
      await queueTextMessage(phone, errorMsg);
      await logOutboundMessage(lead.id, errorMsg);
    }
  }

  log.info({ phone, state }, '[BATCH:END] Funnel batch complete');
}

// ─── Agent-Driven Transition Logic ──────────────────────────

async function handleTransition(
  sessionId: string,
  leadId: string,
  phone: string,
  currentState: FunnelState,
  extractedData: Record<string, unknown>,
): Promise<void> {
  log.info({ currentState, sessionId, extractedData }, '[TRANSITION] handleTransition called');

  switch (currentState) {
    case FUNNEL_STATES.ENGAGING: {
      log.info('[TRANSITION:ENGAGING→COLLECTING_PHOTOS] Starting...');
      await transitionState(sessionId, leadId, currentState, FUNNEL_STATES.COLLECTING_PHOTOS);
      await prisma.lead.update({ where: { id: leadId }, data: { status: 'COLLECTING' } });
      const askMsg = MESSAGES.askPhotos();
      await queueTextMessage(phone, askMsg);
      await logOutboundMessage(leadId, askMsg);
      log.info('[TRANSITION:ENGAGING→COLLECTING_PHOTOS] Done — askPhotos sent');
      break;
    }

    case FUNNEL_STATES.COLLECTING_PHOTOS: {
      log.info({ sessionId }, '[TRANSITION:COLLECTING_PHOTOS→AWAITING_PAYMENT] Creating Pix payment...');
      await prisma.lead.update({ where: { id: leadId }, data: { status: 'PAYING' } });

      log.info('[TRANSITION:PAYMENT] Calling initiatePixPayment...');
      const { qrImageUrl, pixCopyPaste, amount } = await initiatePixPayment(sessionId, leadId);
      log.info({ qrImageUrl: qrImageUrl.substring(0, 80) }, '[TRANSITION:PAYMENT] Pix payment created');

      await transitionState(sessionId, leadId, currentState, FUNNEL_STATES.AWAITING_PAYMENT);

      // Send QR code image with caption
      const caption = MESSAGES.pixPayment(amount);
      await queueMediaMessage(phone, qrImageUrl, {
        mediatype: 'image',
        mimetype: 'image/png',
        caption,
      });
      await logOutboundMessage(leadId, `[QR Code Pix] ${caption}`, 'image');

      // Send copy-paste code as text message
      const copyPasteMsg = MESSAGES.pixCopyPaste(pixCopyPaste);
      await queueTextMessage(phone, copyPasteMsg);
      await logOutboundMessage(leadId, copyPasteMsg);

      await trackEvent(leadId, 'PIX_QR_SENT');
      log.info('[TRANSITION:COLLECTING_PHOTOS→AWAITING_PAYMENT] Done — Pix QR sent');
      break;
    }

    case FUNNEL_STATES.AWAITING_PAYMENT: {
      if (extractedData.changePackage) {
        log.info('[TRANSITION:AWAITING_PAYMENT→ENGAGING] Package change requested');
        await transitionState(sessionId, leadId, currentState, FUNNEL_STATES.ENGAGING);
      }
      break;
    }

    case FUNNEL_STATES.DELIVERED: {
      // Reengagement agent collected occasion+package — jump straight to COLLECTING_PHOTOS
      log.info('[TRANSITION:DELIVERED→COLLECTING_PHOTOS] Returning customer new session');
      const retPrefs: Record<string, unknown> = {};
      for (const key of ['packageId', 'occasion', 'occasionDetails']) {
        if (extractedData[key] !== undefined) retPrefs[key] = extractedData[key];
      }
      await prisma.leadSession.create({
        data: {
          leadId,
          funnelState: FUNNEL_STATES.COLLECTING_PHOTOS,
          preferences: retPrefs as any,
        },
      });
      await prisma.lead.update({ where: { id: leadId }, data: { status: 'COLLECTING' } });
      const askMsg = MESSAGES.askPhotos();
      await queueTextMessage(phone, askMsg);
      await logOutboundMessage(leadId, askMsg);
      await trackEvent(leadId, 'NEW_SESSION_REQUESTED', { returning: true });
      log.info('[TRANSITION:DELIVERED→COLLECTING_PHOTOS] Done — new session created, askPhotos sent');
      break;
    }

    default:
      log.warn({ currentState }, '[TRANSITION] No transition handler for this state');
  }
}

// ─── Fallback (when LLM fails) ─────────────────────────────

async function handleFallback(phone: string, leadId: string, state: FunnelState): Promise<void> {
  log.info({ phone, state }, '[FALLBACK] Sending fallback message');

  switch (state) {
    case FUNNEL_STATES.ENGAGING: {
      // Check if there's already conversation — don't re-introduce Bia
      const hasHistory = await prisma.conversationMessage.count({
        where: { leadId, direction: 'OUTBOUND' },
      });
      if (hasHistory > 0) {
        const msg = MESSAGES.engagementFollowUp();
        await queueTextMessage(phone, msg);
        await logOutboundMessage(leadId, msg);
      } else {
        const msg = MESSAGES.welcome(null);
        await queueTextMessage(phone, msg);
        await logOutboundMessage(leadId, msg);
      }
      break;
    }
    case FUNNEL_STATES.COLLECTING_PHOTOS: {
      const msg = MESSAGES.askPhotos();
      await queueTextMessage(phone, msg);
      await logOutboundMessage(leadId, msg);
      break;
    }
    case FUNNEL_STATES.AWAITING_PAYMENT: {
      const msg = MESSAGES.paymentReminder();
      await queueTextMessage(phone, msg);
      await logOutboundMessage(leadId, msg);
      break;
    }
    case FUNNEL_STATES.GENERATING: {
      const msg = MESSAGES.generationProgress();
      await queueTextMessage(phone, msg);
      await logOutboundMessage(leadId, msg);
      break;
    }
    default: {
      const msg = MESSAGES.errorOccurred();
      await queueTextMessage(phone, msg);
      await logOutboundMessage(leadId, msg);
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────

async function applyExtractedData(
  sessionId: string,
  leadId: string,
  data: Record<string, unknown>,
): Promise<void> {
  // Update lead name if extracted
  if (typeof data.name === 'string' && data.name.trim()) {
    await prisma.lead.update({
      where: { id: leadId },
      data: { name: data.name.trim().substring(0, 100), status: 'QUALIFIED' },
    });
    await trackEvent(leadId, 'QUALIFIED', { name: data.name });
  }

  // Update session preferences (excluding name which goes to Lead)
  const prefUpdates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (key !== 'name' && key !== 'newSession' && key !== 'changePackage' && value !== null && value !== undefined) {
      prefUpdates[key] = value;
    }
  }

  if (Object.keys(prefUpdates).length > 0) {
    const session = await prisma.leadSession.findUnique({ where: { id: sessionId } });
    const current = (session?.preferences as Record<string, unknown>) ?? {};
    await prisma.leadSession.update({
      where: { id: sessionId },
      data: { preferences: { ...current, ...prefUpdates } as any },
    });
  }
}

async function transitionState(
  sessionId: string,
  leadId: string,
  from: FunnelState,
  to: FunnelState,
): Promise<void> {
  if (!canTransition(from, to)) {
    log.warn({ from, to, sessionId }, '[STATE] Transição inválida — bloqueada');
    return;
  }

  await prisma.leadSession.update({
    where: { id: sessionId },
    data: { funnelState: to },
  });

  log.info({ sessionId, from, to }, '[STATE] ✅ State updated in DB');
  await trackEvent(leadId, 'FUNNEL_TRANSITION', { from, to });
}

/**
 * Maps old state names to the new simplified state machine.
 */
function migrateState(state: string): string {
  const migrations: Record<string, string> = {
    WELCOME: 'ENGAGING',
    QUALIFICATION: 'ENGAGING',
    OFFER: 'ENGAGING',
    COLLECTING_STYLE: 'ENGAGING',
    COLLECTING_SCENARIO: 'ENGAGING',
    CONFIRM_PREFERENCES: 'COLLECTING_PHOTOS',
  };
  return migrations[state] ?? state;
}
