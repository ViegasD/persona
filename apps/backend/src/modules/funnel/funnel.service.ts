import { prisma } from '../../shared/database/prisma.js';
import { createChildLogger } from '../../shared/utils/logger.js';
import { queueTextMessage, queueMediaMessage, logOutboundMessage } from '../whatsapp/whatsapp.service.js';
import { initiatePixPayment } from '../payment/payment.service.js';
import { trackEvent } from '../analytics/analytics.service.js';
import { getQueue, QUEUE_NAMES, type MessageBatchJobData } from '../../shared/queue/queues.js';
import { getRedisConnection } from '../../shared/queue/queue.config.js';
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
import { photoCollectionAgent, getPhotoCollectionAgent } from '../ai/agents/photo-collection.agent.js';
import { paymentAgent } from '../ai/agents/payment.agent.js';
import { supportAgent } from '../ai/agents/support.agent.js';
import { reengagementAgent } from '../ai/agents/reengagement.agent.js';
import { styleCollectionAgent } from '../ai/agents/style-collection.agent.js';
import { upsellAgent } from '../ai/agents/upsell.agent.js';
import { confirmationAgent } from '../ai/agents/confirmation.agent.js';
import { getSetting, SETTING_KEYS } from '../admin/settings.service.js';
import { PACKAGES } from './packages.config.js';

const VALID_PACKAGE_IDS = new Set(PACKAGES.map((p) => p.id));
const VALID_OCCASIONS = new Set([
  'aniversario', 'profissional', 'fim_de_curso', 'formatura',
  'casal', 'gravidez', 'casual', 'infantil', 'pet', 'corporativo',
]);

const log = createChildLogger('funnel-service');

const AGENTS: Record<string, AgentConfig> = {
  engagement: engagementAgent,
  'photo-collection': photoCollectionAgent,
  'style-collection': styleCollectionAgent,
  upsell: upsellAgent,
  confirmation: confirmationAgent,
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

  // Acquire a per-phone lock to prevent concurrent batches from sending duplicate messages
  const redis = getRedisConnection();
  const lockKey = `funnel_lock:${phone}`;
  const lockValue = `${Date.now()}_${Math.random()}`;
  const acquired = await redis.set(lockKey, lockValue, 'PX', 60_000, 'NX');
  if (!acquired) {
    log.info({ phone }, '[BATCH:LOCKED] Another batch is processing — re-queuing with delay');
    const batchQueue = getQueue(QUEUE_NAMES.MESSAGE_BATCH);
    await batchQueue.add(
      'process-batch',
      { phone, leadId } satisfies MessageBatchJobData,
      { jobId: `batch_retry_${phone}_${Date.now()}`, delay: 5000, removeOnComplete: true, removeOnFail: true },
    );
    return;
  }

  try {
    await _handleFunnelBatchInner(phone, leadId);
  } finally {
    // Release lock only if we still own it
    const current = await redis.get(lockKey);
    if (current === lockValue) {
      await redis.del(lockKey);
    }
  }
}

async function _handleFunnelBatchInner(phone: string, leadId: string): Promise<void> {
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
    where: { leadSessionId: session.id, type: 'face' },
  });

  const styleRefCount = await prisma.referenceImage.count({
    where: { leadSessionId: session.id, type: 'style' },
  });

  const prefs = (session.preferences as Record<string, unknown>) ?? {};

  log.info(
    { phone, state, leadId, sessionId: session.id, photoCount, prefs },
    '[BATCH:CONTEXT] Loaded lead context',
  );

  // ─── Step 0: Static welcome for brand-new sessions ──────
  if (state === FUNNEL_STATES.ENGAGING) {
    const outboundCount = await prisma.conversationMessage.count({
      where: { leadId: lead.id, direction: 'OUTBOUND' },
    });
    if (outboundCount === 0) {
      log.info('[BATCH:WELCOME] First contact — sending static welcome');
      const welcomeMsg = MESSAGES.welcome(lead.name);
      await queueTextMessage(phone, welcomeMsg);
      await logOutboundMessage(lead.id, welcomeMsg);
      log.info('[BATCH:WELCOME] Welcome sent — skipping LLM');
      return;
    }
  }

  // ─── Step 1: LLM Agent Call ──────────────────────────────
  let agentResponse: AgentResponse;
  let agentName: string;
  try {
    // Select agent
    agentName = getAgentForState(state);
    // For photo-collection, use dynamic prompt based on whether min photos reached
    const minPhotos = prefs.occasion === 'casal' ? 4 : 2;
    const minReached = photoCount >= minPhotos;
    const agent = agentName === 'photo-collection'
      ? getPhotoCollectionAgent(minReached)
      : AGENTS[agentName];
    if (!agent) {
      log.error({ agentName, state }, '[BATCH:AGENT] Agent not found');
      await queueTextMessage(phone, MESSAGES.errorOccurred());
      return;
    }

    log.info({ agentName, state }, '[BATCH:AGENT] Selected agent');

    // Scope conversation history to the current session so the LLM only sees
    // messages from this session, not from previous sessions on the same lead.
    // For DELIVERED sessions, use updatedAt (= delivery timestamp) so the
    // reengagement agent doesn't see old payment/photo-collection messages.
    const historySince =
      state === FUNNEL_STATES.DELIVERED ? session.updatedAt : session.createdAt;
    const conversationHistory = await buildConversationContext(leadId, 20, historySince);
    log.info(
      { messageCount: conversationHistory.length, roles: conversationHistory.map((m) => m.role) },
      '[BATCH:HISTORY] Conversation history loaded',
    );

    const portfolioUrl = await getSetting(SETTING_KEYS.PORTFOLIO_URL);
    const leadContext = buildLeadContext(
      { name: lead.name, phone: lead.phone },
      { preferences: prefs, photoCount, styleRefCount },
      portfolioUrl || undefined,
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

    // ── Validate LLM response structure ──
    if (!Array.isArray(agentResponse.messages)) {
      log.warn({ agentName, raw: agentResponse }, '[BATCH:VALIDATE] messages is not an array — using fallback');
      agentResponse.messages = [];
    }
    const validMessages = agentResponse.messages.filter((m) => typeof m === 'string' && m.trim());

    // Deduplicate messages — LLM sometimes echoes the same bubble twice
    const seen = new Set<string>();
    const dedupedMessages = validMessages.filter((m) => {
      const key = m.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (dedupedMessages.length === 0) {
      log.warn({ agentName, shouldTransition: agentResponse.shouldTransition }, '[BATCH:VALIDATE] No valid messages from LLM — sending fallback');
      await handleFallback(phone, lead.id, state);
      // Still apply extracted data if present, but do NOT transition on empty response
      if (agentResponse.extractedData && Object.keys(agentResponse.extractedData).length > 0) {
        await applyExtractedData(session.id, lead.id, agentResponse.extractedData);
      }
      return;
    }

    log.info(
      {
        agentName,
        shouldTransition: agentResponse.shouldTransition,
        messages: dedupedMessages.length,
        deduped: validMessages.length - dedupedMessages.length,
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
    for (const msg of dedupedMessages) {
      if (msg.trim()) {
        // Typing delay: ~30ms per character, clamped between 800ms and 3000ms
        const typingDelay = Math.min(3000, Math.max(800, msg.length * 30));
        await queueTextMessage(phone, msg, {
          typingDelay,
          ...(stagger > 0 ? { jobDelay: stagger } : {}),
        });
        // 1.5–3.5s between bubbles to mimic human typing
        stagger += 1500 + Math.floor(Math.random() * 2000);
      }
    }

    // Save all bubbles as ONE assistant message so the LLM sees its own history
    const fullReply = dedupedMessages.join('\n\n');
    if (fullReply) {
      await logOutboundMessage(lead.id, fullReply);
    }

    log.info(
      { messageBubbles: dedupedMessages.length },
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
      // Re-read session state to prevent duplicate transitions from concurrent batches
      const freshSession = await prisma.leadSession.findUnique({ where: { id: session.id } });
      const freshState = freshSession?.funnelState as FunnelState | undefined;
      if (freshState && freshState !== state) {
        log.warn({ expectedState: state, actualState: freshState }, '[BATCH:TRANSITION] State already changed by another batch — skipping transition');
      } else {
        log.info({ from: state, sessionId: session.id }, '[BATCH:TRANSITION] Starting transition...');
        await handleTransition(session.id, lead.id, phone, state, agentResponse.extractedData ?? {});
        log.info({ from: state }, '[BATCH:TRANSITION] Transition completed successfully');
      }
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

      // Only send askPhotos if the user hasn't already sent reference photos during ENGAGING
      const earlyPhotos = await prisma.referenceImage.count({ where: { leadSessionId: sessionId } });
      if (earlyPhotos === 0) {
        const askMsg = MESSAGES.askPhotos();
        await queueTextMessage(phone, askMsg, { jobDelay: 2000 });
        await logOutboundMessage(leadId, askMsg);
      } else {
        // Photos already received — trigger photo-collection agent after a delay
        // (long enough for the current batch's Redis lock to be released)
        log.info({ earlyPhotos }, '[TRANSITION:ENGAGING→COLLECTING_PHOTOS] Photos already received — scheduling photo-collection trigger');
        const batchQueue = getQueue(QUEUE_NAMES.MESSAGE_BATCH);
        await batchQueue.add(
          'process-batch',
          { phone, leadId } satisfies MessageBatchJobData,
          { jobId: `photo_trigger_${phone}_${Date.now()}`, delay: 8000, removeOnComplete: true, removeOnFail: true },
        );
      }
      log.info('[TRANSITION:ENGAGING→COLLECTING_PHOTOS] Done');
      break;
    }

    case FUNNEL_STATES.COLLECTING_PHOTOS: {
      // Skip style-refs step by default — go straight to upsell/payment
      // (COLLECTING_STYLE_REFS only enters if the user explicitly asks for a custom style we don't have)
      const photoSession = await prisma.leadSession.findUnique({ where: { id: sessionId } });
      const photoPkg = (photoSession?.preferences as Record<string, unknown>)?.packageId as string | undefined;

      if (!photoPkg || !VALID_PACKAGE_IDS.has(photoPkg)) {
        log.error({ photoPkg, sessionId }, '[TRANSITION:COLLECTING_PHOTOS] Missing or invalid packageId — cannot proceed');
        const fallbackMsg = 'Antes de continuar, me fala qual pacote você quer? 😊\n\n🎁 *10 fotos* — R$ 34,90 (mais popular)\n📦 5 fotos — R$ 18,90\n📦 3 fotos — R$ 13,90\n📦 2 fotos — R$ 9,90';
        await queueTextMessage(phone, fallbackMsg);
        await logOutboundMessage(leadId, fallbackMsg);
        // Revert to ENGAGING so the engagement agent can collect the package
        await transitionState(sessionId, leadId, currentState, FUNNEL_STATES.ENGAGING);
        return;
      }

      const photoIsTop = photoPkg === 'pkg_10';
      const photoPromoShown = !!(photoSession?.preferences as Record<string, unknown>)?.promoShown;

      if (photoIsTop || photoPromoShown) {
        log.info({ currentPkg: photoPkg, promoShown: photoPromoShown }, '[TRANSITION:COLLECTING_PHOTOS→CONFIRMING_DATA] Skipping upsell (top pkg or promo already shown)');
        await transitionState(sessionId, leadId, currentState, FUNNEL_STATES.CONFIRMING_DATA);
        const batchQueue = getQueue(QUEUE_NAMES.MESSAGE_BATCH);
        await batchQueue.add(
          'process-batch',
          { phone, leadId } satisfies MessageBatchJobData,
          { jobId: `confirm_trigger_${phone}_${Date.now()}`, delay: 2000, removeOnComplete: true, removeOnFail: true },
        );
        log.info('[TRANSITION:COLLECTING_PHOTOS→CONFIRMING_DATA] Confirmation batch job queued with 2s delay');
      } else {
        log.info({ currentPkg: photoPkg }, '[TRANSITION:COLLECTING_PHOTOS→UPSELLING] Transitioning to upsell');
        await transitionState(sessionId, leadId, currentState, FUNNEL_STATES.UPSELLING);
        const batchQueue = getQueue(QUEUE_NAMES.MESSAGE_BATCH);
        await batchQueue.add(
          'process-batch',
          { phone, leadId } satisfies MessageBatchJobData,
          { jobId: `upsell_trigger_${phone}_${Date.now()}`, delay: 2000, removeOnComplete: true, removeOnFail: true },
        );
        log.info('[TRANSITION:COLLECTING_PHOTOS→UPSELLING] Upsell batch job queued with 2s delay');
      }
      break;
    }

    case FUNNEL_STATES.COLLECTING_STYLE_REFS: {
      // Check if client already has the top package — skip upsell
      const session = await prisma.leadSession.findUnique({ where: { id: sessionId } });
      const currentPkg = (session?.preferences as Record<string, unknown>)?.packageId as string | undefined;
      const isTopPackage = currentPkg === 'pkg_10';

      if (isTopPackage) {
        log.info({ currentPkg }, '[TRANSITION:COLLECTING_STYLE_REFS→CONFIRMING_DATA] Top package — skipping upsell');
        await transitionState(sessionId, leadId, currentState, FUNNEL_STATES.CONFIRMING_DATA);
        const batchQueue = getQueue(QUEUE_NAMES.MESSAGE_BATCH);
        await batchQueue.add(
          'process-batch',
          { phone, leadId } satisfies MessageBatchJobData,
          { jobId: `confirm_trigger_${phone}_${Date.now()}`, delay: 2000, removeOnComplete: true, removeOnFail: true },
        );
        log.info('[TRANSITION:COLLECTING_STYLE_REFS→CONFIRMING_DATA] Confirmation batch job queued with 2s delay');
      } else {
        log.info({ currentPkg }, '[TRANSITION:COLLECTING_STYLE_REFS→UPSELLING] Transitioning to upsell');
        await transitionState(sessionId, leadId, currentState, FUNNEL_STATES.UPSELLING);
        // Queue a synthetic batch job so the upsell agent fires proactively
        // (no user message will arrive — the agent must initiate the offer)
        const batchQueue = getQueue(QUEUE_NAMES.MESSAGE_BATCH);
        await batchQueue.add(
          'process-batch',
          { phone, leadId } satisfies MessageBatchJobData,
          { jobId: `upsell_trigger_${phone}_${Date.now()}`, delay: 2000, removeOnComplete: true, removeOnFail: true },
        );
        log.info('[TRANSITION:COLLECTING_STYLE_REFS→UPSELLING] Upsell batch job queued with 2s delay');
      }
      break;
    }

    case FUNNEL_STATES.UPSELLING: {
      // Apply package upgrade if accepted
      if (extractedData.upgradeAccepted && typeof extractedData.newPackageId === 'string') {
        log.info({ newPackageId: extractedData.newPackageId }, '[TRANSITION:UPSELLING] Upgrade accepted — updating packageId');
        // Update the session packageId + store upsell promo price so the Pix payment uses it
        const upsellSession = await prisma.leadSession.findUnique({ where: { id: sessionId } });
        const upsellPrefs = (upsellSession?.preferences as Record<string, unknown>) ?? {};
        await prisma.leadSession.update({
          where: { id: sessionId },
          data: { preferences: { ...upsellPrefs, packageId: extractedData.newPackageId, priceOverride: 29.90 } as any },
        });
        await trackEvent(leadId, 'UPSELL_ACCEPTED', { newPackageId: extractedData.newPackageId });
      } else {
        log.info('[TRANSITION:UPSELLING] Upgrade declined');
        await trackEvent(leadId, 'UPSELL_DECLINED');
      }

      // Transition to data confirmation step before payment
      log.info('[TRANSITION:UPSELLING→CONFIRMING_DATA] Transitioning to confirmation');
      await transitionState(sessionId, leadId, currentState, FUNNEL_STATES.CONFIRMING_DATA);
      const batchQueue = getQueue(QUEUE_NAMES.MESSAGE_BATCH);
      await batchQueue.add(
        'process-batch',
        { phone, leadId } satisfies MessageBatchJobData,
        { jobId: `confirm_trigger_${phone}_${Date.now()}`, delay: 2000, removeOnComplete: true, removeOnFail: true },
      );
      log.info('[TRANSITION:UPSELLING→CONFIRMING_DATA] Confirmation batch job queued with 2s delay');
      break;
    }

    case FUNNEL_STATES.CONFIRMING_DATA: {
      if (extractedData.changePackage) {
        log.info('[TRANSITION:CONFIRMING_DATA→ENGAGING] Package change requested');
        await transitionState(sessionId, leadId, currentState, FUNNEL_STATES.ENGAGING);
      } else {
        // Client confirmed — create Pix payment and transition
        await createPixAndTransition(sessionId, leadId, phone, currentState);
      }
      break;
    }

    case FUNNEL_STATES.AWAITING_PAYMENT: {
      if (extractedData.changePackage) {
        log.info('[TRANSITION:AWAITING_PAYMENT→ENGAGING] Package change requested');
        await transitionState(sessionId, leadId, currentState, FUNNEL_STATES.ENGAGING);
      } else if (extractedData.regenerateQr) {
        log.info('[AWAITING_PAYMENT] Regenerating Pix QR Code');
        try {
          const { qrImageUrl, pixCopyPaste, amount } = await initiatePixPayment(sessionId, leadId);
          const caption = MESSAGES.pixPayment(amount);
          await queueMediaMessage(phone, qrImageUrl, {
            mediatype: 'image',
            mimetype: 'image/png',
            caption,
          });
          await logOutboundMessage(leadId, `[QR Code Pix Regenerado] ${caption}`, 'image');
          const copyPasteMsg = MESSAGES.pixCopyPaste(pixCopyPaste);
          await queueTextMessage(phone, copyPasteMsg, { jobDelay: 1500 });
          await logOutboundMessage(leadId, copyPasteMsg);
          await trackEvent(leadId, 'PIX_QR_REGENERATED');
        } catch (err) {
          log.error({ err, sessionId }, '[AWAITING_PAYMENT] Failed to regenerate Pix');
          await queueTextMessage(phone, 'Ops, tive um probleminha pra gerar o novo QR. Tenta de novo em alguns segundos? 🙏');
        }
      }
      break;
    }

    case FUNNEL_STATES.DELIVERED: {
      // Reengagement agent collected occasion+package — jump straight to COLLECTING_PHOTOS
      const retPkg = extractedData.packageId as string | undefined;
      if (!retPkg || !VALID_PACKAGE_IDS.has(retPkg)) {
        log.error({ extractedData, sessionId }, '[TRANSITION:DELIVERED] Missing or invalid packageId from reengagement — aborting');
        const msg = 'Antes de continuar, me fala qual pacote você quer? 😊\n\n🎁 *10 fotos* — R$ 34,90 (mais popular)\n📦 5 fotos — R$ 18,90\n📦 3 fotos — R$ 13,90\n📦 2 fotos — R$ 9,90';
        await queueTextMessage(phone, msg);
        await logOutboundMessage(leadId, msg);
        return; // Stay in DELIVERED — reengagement agent will collect package
      }

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

// ─── Shared: Create Pix payment and transition to AWAITING_PAYMENT ──

async function createPixAndTransition(
  sessionId: string,
  leadId: string,
  phone: string,
  fromState: FunnelState,
): Promise<void> {
  log.info({ sessionId, fromState }, '[PIX] Creating Pix payment...');
  await prisma.lead.update({ where: { id: leadId }, data: { status: 'PAYING' } });

  const { qrImageUrl, pixCopyPaste, amount } = await initiatePixPayment(sessionId, leadId);
  log.info({ qrImageUrl: qrImageUrl.substring(0, 80) }, '[PIX] Pix payment created');

  await transitionState(sessionId, leadId, fromState, FUNNEL_STATES.AWAITING_PAYMENT);

  // 1. QR code image with caption
  const caption = MESSAGES.pixPayment(amount);
  await queueMediaMessage(phone, qrImageUrl, {
    mediatype: 'image',
    mimetype: 'image/png',
    caption,
  });
  await logOutboundMessage(leadId, `[QR Code Pix] ${caption}`, 'image');

  // 2. Raw PIX code alone — user can long-press to copy
  const copyPasteMsg = MESSAGES.pixCopyPaste(pixCopyPaste);
  await queueTextMessage(phone, copyPasteMsg, { jobDelay: 1500 });
  await logOutboundMessage(leadId, copyPasteMsg);

  // 3. Hint on how to use the PIX code
  const hintMsg = MESSAGES.pixCopyPasteHint();
  await queueTextMessage(phone, hintMsg, { jobDelay: 2500 });
  await logOutboundMessage(leadId, hintMsg);

  await trackEvent(leadId, 'PIX_QR_SENT');
  log.info({ fromState }, '[PIX] Done — Pix QR sent');
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
    case FUNNEL_STATES.COLLECTING_STYLE_REFS: {
      const msg = MESSAGES.askStyleRefs();
      await queueTextMessage(phone, msg);
      await logOutboundMessage(leadId, msg);
      break;
    }
    case FUNNEL_STATES.UPSELLING: {
      // Upsell fallback — just skip to confirmation
      const msg = 'Vamos confirmar seus dados antes do pagamento! 😊';
      await queueTextMessage(phone, msg);
      await logOutboundMessage(leadId, msg);
      break;
    }
    case FUNNEL_STATES.CONFIRMING_DATA: {
      // Confirmation fallback — just skip to payment
      const msg = 'Vamos seguir pro pagamento! 😊';
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
    case FUNNEL_STATES.GALLERY_SENT:
    case FUNNEL_STATES.APPROVING: {
      const msg = MESSAGES.galleryFallback();
      await queueTextMessage(phone, msg);
      await logOutboundMessage(leadId, msg);
      break;
    }
    case FUNNEL_STATES.DELIVERING: {
      const msg = MESSAGES.deliveringFallback();
      await queueTextMessage(phone, msg);
      await logOutboundMessage(leadId, msg);
      break;
    }
    case FUNNEL_STATES.DELIVERED: {
      const msg = MESSAGES.deliveredFallback();
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
      // Validate packageId and occasion before storing
      if (key === 'packageId' && (typeof value !== 'string' || !VALID_PACKAGE_IDS.has(value))) {
        log.warn({ key, value }, '[DATA:VALIDATE] Invalid packageId — discarded');
        continue;
      }
      if (key === 'occasion' && (typeof value !== 'string' || !VALID_OCCASIONS.has(value))) {
        log.warn({ key, value }, '[DATA:VALIDATE] Unknown occasion — storing anyway');
        // Still store — it might be a niche occasion the LLM normalized differently
      }
      prefUpdates[key] = value;
    }
  }

  if (Object.keys(prefUpdates).length > 0) {
    const session = await prisma.leadSession.findUnique({ where: { id: sessionId } });
    const current = (session?.preferences as Record<string, unknown>) ?? {};
    const merged = { ...current, ...prefUpdates };

    // ── Clean stale data when occasion changes ──
    if (typeof prefUpdates.occasion === 'string' && current.occasion && prefUpdates.occasion !== current.occasion) {
      const OCCASION_FIELDS = ['ageAtBirthday', 'profession', 'graduationCourse', 'occasionDetails'];
      for (const field of OCCASION_FIELDS) {
        delete merged[field];
      }
      log.info(
        { oldOccasion: current.occasion, newOccasion: prefUpdates.occasion },
        '[DATA:CLEANUP] Occasion changed — cleared stale occasion fields',
      );
    }

    // ── Clear priceOverride when package changes (prevents wrong charge) ──
    if (typeof prefUpdates.packageId === 'string' && current.packageId && prefUpdates.packageId !== current.packageId) {
      delete merged.priceOverride;
      log.info(
        { oldPkg: current.packageId, newPkg: prefUpdates.packageId },
        '[DATA:CLEANUP] Package changed — cleared priceOverride',
      );
    }

    await prisma.leadSession.update({
      where: { id: sessionId },
      data: { preferences: merged as any },
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
