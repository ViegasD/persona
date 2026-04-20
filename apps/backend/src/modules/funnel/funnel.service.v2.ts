import { prisma } from '../../shared/database/prisma.js';
import { createChildLogger } from '../../shared/utils/logger.js';
import { queueTextMessage, queueMediaMessage, logOutboundMessage, showTypingForLead } from '../whatsapp/whatsapp.service.js';
import { initiatePixPayment } from '../payment/payment.service.js';
import { trackEvent } from '../analytics/analytics.service.js';
import { getQueue, QUEUE_NAMES, type MessageBatchJobData } from '../../shared/queue/queues.js';
import { getRedisConnection } from '../../shared/queue/queue.config.js';
import {
  FUNNEL_STATES,
  canTransition,
  migrateState,
  type FunnelState,
} from './funnel.state-machine.v2.js';
import { MESSAGES } from './messages.templates.js';
import { callLlmJson } from '../ai/llm.client.js';
import { buildConversationContext } from '../ai/conversation.context.js';
import { buildLeadContext } from '../ai/agents/base.js';
import { extractionAgent, type ExtractionResult } from '../ai/agents/extraction.agent.js';
import { conversationAgent, type ConversationResponse } from '../ai/agents/conversation.agent.js';
import { getSetting, getSettingNumber, getAgentModel, SETTING_KEYS } from '../admin/settings.service.js';
import { PACKAGES, OCCASIONS } from './packages.config.js';

const VALID_PACKAGE_IDS = new Set(PACKAGES.map((p) => p.id));
const VALID_MESSAGE_TYPES = new Set(Object.keys(OCCASIONS));

const log = createChildLogger('funnel-v2');

/** States where stale follow-ups make sense. */
const FOLLOWUP_STATES = new Set<string>([
  FUNNEL_STATES.CONVERSATION,
  FUNNEL_STATES.AWAITING_PAYMENT,
]);

/** States where extraction should run. */
const EXTRACTION_STATES = new Set<string>([
  FUNNEL_STATES.CONVERSATION,
  FUNNEL_STATES.AWAITING_PAYMENT,
  FUNNEL_STATES.DELIVERED,
]);

// ─── Main Entry Point ───────────────────────────────────────

export async function handleFunnelBatch(phone: string, leadId: string, followUpTier?: number): Promise<void> {
  log.info({ phone, leadId, followUpTier }, '[BATCH:START] Processing funnel batch');

  const redis = getRedisConnection();
  const lockKey = `funnel_lock:${phone}`;
  const lockValue = `${Date.now()}_${Math.random()}`;
  const acquired = await redis.set(lockKey, lockValue, 'PX', 60_000, 'NX');
  if (!acquired) {
    log.info({ phone }, '[BATCH:LOCKED] Another batch is processing — re-queuing');
    const batchQueue = getQueue(QUEUE_NAMES.MESSAGE_BATCH);
    await batchQueue.add(
      'process-batch',
      { phone, leadId } satisfies MessageBatchJobData,
      { jobId: `batch_retry_${phone}_${Date.now()}`, delay: 5000, removeOnComplete: true, removeOnFail: true },
    );
    return;
  }

  try {
    await _handleBatchInner(phone, leadId, followUpTier);
  } finally {
    const current = await redis.get(lockKey);
    if (current === lockValue) await redis.del(lockKey);
  }
}

// ─── Inner Batch Handler ────────────────────────────────────

async function _handleBatchInner(phone: string, leadId: string, followUpTier?: number): Promise<void> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) {
    log.warn({ leadId }, '[BATCH] Lead not found');
    return;
  }

  // Get or create session
  let session = await prisma.leadSession.findFirst({
    where: { leadId: lead.id },
    orderBy: { createdAt: 'desc' },
  });
  if (!session) {
    session = await prisma.leadSession.create({
      data: { leadId: lead.id, funnelState: FUNNEL_STATES.CONVERSATION },
    });
    log.info({ sessionId: session.id }, '[BATCH] New session created');
    await trackEvent(lead.id, 'LEAD_CREATED', { source: lead.source });
  }

  // Migrate old state names
  let state = migrateState(session.funnelState);
  if (state !== session.funnelState) {
    log.info({ old: session.funnelState, new: state }, '[BATCH] Migrated state');
    await prisma.leadSession.update({ where: { id: session.id }, data: { funnelState: state } });
  }

  let prefs = (session.preferences as Record<string, unknown>) ?? {};

  // Load active characters for catalog
  const characterCatalog = await prisma.character.findMany({
    where: { isActive: true },
    select: { name: true, slug: true, personality: true, franchise: true },
    orderBy: { name: 'asc' },
  });

  log.info({ phone, state, leadId, sessionId: session.id, prefs }, '[BATCH:CTX] Loaded context');

  // ─── AI disabled check ────────────────────────────────────
  if (!session.aiEnabled) {
    log.info({ phone, sessionId: session.id }, '[BATCH] AI disabled for this session — skipping');
    return;
  }

  // ─── Follow-up guard ──────────────────────────────────────
  const isFollowUp = !!followUpTier;
  if (isFollowUp) {
    const lastMsg = await prisma.conversationMessage.findFirst({
      where: { leadId: lead.id },
      orderBy: { createdAt: 'desc' },
      select: { direction: true, content: true },
    });
    if (lastMsg?.direction === 'INBOUND') {
      log.info({ phone, tier: followUpTier }, '[FOLLOWUP] Client already replied — skipping');
      return;
    }
    if (!FOLLOWUP_STATES.has(state)) {
      log.info({ phone, state, tier: followUpTier }, '[FOLLOWUP] State not eligible — skipping');
      return;
    }
    if (followUpTier === 1) {
      log.info({ phone }, '[FOLLOWUP:T1] Static nudge');
      const nudge = 'Oi! Podemos continuar? 😊';
      await queueTextMessage(phone, nudge);
      await logOutboundMessage(leadId, nudge);
      scheduleFollowUps(phone, leadId, 1).catch((err) =>
        log.warn({ err }, '[FOLLOWUP] Failed to schedule t2+ — non-critical'),
      );
      return;
    } else {
      log.info({ phone, tier: followUpTier }, '[FOLLOWUP] Running stale follow-up');
    }
  }

  // ─── Static welcome for brand-new sessions ────────────────
  if (state === FUNNEL_STATES.CONVERSATION) {
    const outboundCount = await prisma.conversationMessage.count({
      where: { leadId: lead.id, direction: 'OUTBOUND' },
    });
    if (outboundCount === 0) {
      log.info('[WELCOME] First contact — sending static welcome');
      const welcomeMsg = MESSAGES.welcome(lead.name);
      await queueTextMessage(phone, welcomeMsg);
      await logOutboundMessage(lead.id, welcomeMsg);
      return;
    }
  }

  // ─── Reactivate churned leads ─────────────────────────────
  if (state === FUNNEL_STATES.CHURNED) {
    await transitionState(session.id, lead.id, state, FUNNEL_STATES.CONVERSATION);
    state = FUNNEL_STATES.CONVERSATION;
    log.info({ phone }, '[REACTIVATE] Churned → Conversation');
  }

  // ─── STEP 1: Extraction ───────────────────────────────────
  // Skip extraction on follow-ups — no new user data to extract
  let extraction: ExtractionResult | null = null;
  if (!isFollowUp && EXTRACTION_STATES.has(state)) {
    try {
      extraction = await runExtraction(leadId, lead, session, prefs, characterCatalog);
      if (extraction && Object.keys(extraction).length > 0) {
        log.info({ extraction }, '[EXTRACT] Data extracted');
        await applyExtractedData(session.id, lead.id, extraction);
        // Reload prefs after extraction
        const freshSession = await prisma.leadSession.findUnique({ where: { id: session.id } });
        prefs = (freshSession?.preferences as Record<string, unknown>) ?? {};
      }
    } catch (err) {
      log.warn({ err }, '[EXTRACT] Extraction failed — continuing without');
    }
  }

  // ─── STEP 2: Pre-conversation transitions ─────────────────

  // AWAITING_PAYMENT: package change → back to CONVERSATION
  if (state === FUNNEL_STATES.AWAITING_PAYMENT && extraction?.changePackage) {
    log.info('[TRANSITION] AWAITING_PAYMENT → CONVERSATION (package change)');
    await transitionState(session.id, lead.id, state, FUNNEL_STATES.CONVERSATION);
    state = FUNNEL_STATES.CONVERSATION;
  }

  // AWAITING_PAYMENT: regenerate QR
  if (state === FUNNEL_STATES.AWAITING_PAYMENT && extraction?.regenerateQr) {
    log.info('[PIX:REGENERATE] Regenerating QR');
    try {
      const { qrImageUrl, pixCopyPaste, amount } = await initiatePixPayment(session.id, lead.id);
      const paymentAccountName = await getSetting(SETTING_KEYS.PAYMENT_ACCOUNT_NAME);
      const caption = MESSAGES.pixPayment(amount, paymentAccountName || undefined);
      await queueMediaMessage(phone, qrImageUrl, {
        mediatype: 'image',
        mimetype: 'image/png',
        caption,
      });
      await logOutboundMessage(leadId, `[QR Code Pix Regenerado] ${caption}`, 'image');
      await new Promise((r) => setTimeout(r, 3000));
      const copyPasteMsg = MESSAGES.pixCopyPaste(pixCopyPaste);
      await queueTextMessage(phone, copyPasteMsg);
      await logOutboundMessage(leadId, copyPasteMsg);
      await trackEvent(leadId, 'PIX_QR_REGENERATED');
    } catch (err) {
      log.error({ err }, '[PIX:REGENERATE] Failed');
      await queueTextMessage(phone, 'Ops, tive um probleminha pra gerar o novo QR. Tenta de novo? 🙏');
    }
    return;
  }

  // ─── STEP 3: Conversation agent ───────────────────────────
  let messages: string[] = [];
  try {
    const historySince = state === FUNNEL_STATES.DELIVERED ? session.updatedAt : session.createdAt;
    const conversationHistory = await buildConversationContext(leadId, 20, historySince);
    log.info({ msgCount: conversationHistory.length }, '[HISTORY] Loaded');

    const portfolioUrl = await getSetting(SETTING_KEYS.PORTFOLIO_URL);
    const agentIdentity = await getSetting(SETTING_KEYS.AGENT_IDENTITY);
    const leadContext = buildLeadContext(
      { name: lead.name, phone: lead.phone },
      { preferences: prefs, photoCount: 0, characterCatalog: characterCatalog.map((c: { name: string; slug: string; personality: string | null; franchise: string | null }) => ({ name: c.name, slug: c.slug, description: c.personality, franchise: c.franchise })) },
      portfolioUrl || undefined,
    );
    const stateContext = `\n--- ESTADO ATUAL: ${state} ---`;
    const followUpContext = buildFollowUpContext(isFollowUp, followUpTier);

    const systemMessage = conversationAgent.systemPrompt.replace('{AGENT_IDENTITY}', agentIdentity) + '\n\n' + leadContext + stateContext + followUpContext;

    const agentModel = await getAgentModel('conversation');
    log.info({ model: agentModel }, '[LLM] Calling conversation agent...');
    const { data } = await callLlmJson<ConversationResponse>(
      [{ role: 'system', content: systemMessage }, ...conversationHistory],
      { leadId: lead.id, agentName: 'conversation', model: agentModel },
    );

    // Validate + dedup messages
    if (!Array.isArray(data.messages)) {
      log.warn('[LLM:VALIDATE] messages not an array');
      data.messages = [];
    }
    const validMessages = data.messages
      .filter((m) => typeof m === 'string' && m.trim())
      .map((m) => m.replace(/\\n/g, '\n'));

    const seen = new Set<string>();
    messages = validMessages.filter((m) => {
      const key = m.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (messages.length === 0) {
      log.warn('[LLM:VALIDATE] No valid messages — sending fallback');
      await handleFallback(phone, lead.id, state);
      return;
    }

    log.info(
      { messages: messages.length, reasoning: data.reasoning },
      '[LLM] Response received',
    );

    // Send messages sequentially with typing indicator before each
    for (let i = 0; i < messages.length; i++) {
      await showTypingForLead(phone);
      // First bubble: shorter pause (user already waited for LLM). Subsequent: 3s.
      await new Promise((r) => setTimeout(r, i === 0 ? 1500 : 3000));
      await queueTextMessage(phone, messages[i]);
    }
    const fullReply = messages.join('\n\n');
    await logOutboundMessage(lead.id, fullReply);

    log.info({ bubbles: messages.length }, '[SEND] Messages sent');
  } catch (error) {
    log.error(error, '[LLM:ERROR] Conversation agent failed');
    await handleFallback(phone, lead.id, state);
    return;
  }

  // ─── STEP 4: Post-message transitions ─────────────────────

  // CONVERSATION: data confirmed + ready → create Pix
  if (state === FUNNEL_STATES.CONVERSATION && extraction?.dataConfirmed) {
    if (
      prefs.packageId && VALID_PACKAGE_IDS.has(prefs.packageId as string) &&
      isVideoDataComplete(prefs)
    ) {
      try {
        log.info('[TRANSITION] CONVERSATION → AWAITING_PAYMENT (data confirmed)');
        await createPixAndTransition(session.id, lead.id, phone, state);
      } catch (err) {
        log.error(err, '[PIX:ERROR] Failed to create Pix');
        const errorMsg = '⚠️ Tive um probleminha técnico, mas já estou resolvendo! Vou te chamar em instantes 😊';
        await queueTextMessage(phone, errorMsg);
        await logOutboundMessage(lead.id, errorMsg);
      }
    } else {
      log.info({ prefs }, '[TRANSITION] dataConfirmed but not ready yet');
    }
  }

  // DELIVERED: new session when we have a packageId
  if (state === FUNNEL_STATES.DELIVERED) {
    const pkgId = (extraction?.packageId ?? prefs.packageId) as string | undefined;
    if (pkgId && VALID_PACKAGE_IDS.has(pkgId)) {
      log.info({ pkgId }, '[TRANSITION] DELIVERED → new session');
      const newPrefs: Record<string, unknown> = {};
      for (const key of ['packageId', 'characterId', 'characterName', 'messageType', 'recipientName', 'recipientAge', 'customMessage']) {
        const val = (extraction as any)?.[key] ?? prefs[key];
        if (val !== undefined && val !== null) newPrefs[key] = val;
      }
      await prisma.leadSession.create({
        data: { leadId: lead.id, funnelState: FUNNEL_STATES.CONVERSATION, preferences: newPrefs as any },
      });
      await prisma.lead.update({ where: { id: leadId }, data: { status: 'COLLECTING' } });
      await trackEvent(lead.id, 'NEW_SESSION_REQUESTED', { returning: true });
      return;
    }
  }

  // ─── STEP 5: Schedule follow-ups ──────────────────────────
  // Schedule for normal batches (all tiers) and follow-up re-runs (higher tiers only)
  if (FOLLOWUP_STATES.has(state)) {
    scheduleFollowUps(phone, leadId, followUpTier).catch((err) =>
      log.warn({ err }, '[FOLLOWUP] Failed to schedule — non-critical'),
    );
  }

  log.info({ phone, state }, '[BATCH:END] Done');
}

// ─── Extraction Runner ──────────────────────────────────────

async function runExtraction(
  leadId: string,
  lead: { name: string | null; phone: string },
  session: { id: string; createdAt: Date; updatedAt: Date; preferences: unknown },
  prefs: Record<string, unknown>,
  characterCatalog: Array<{ name: string; slug: string; personality: string | null; franchise: string | null }>,
): Promise<ExtractionResult | null> {
  const historySince = session.createdAt;
  // Use last 6 messages for extraction (3 exchanges)
  const history = await buildConversationContext(leadId, 6, historySince);
  if (history.length === 0) return null;

  const leadContext = buildLeadContext(
    { name: lead.name, phone: lead.phone },
    { preferences: prefs, photoCount: 0, characterCatalog: characterCatalog.map(c => ({ name: c.name, slug: c.slug, description: c.personality, franchise: c.franchise })) },
  );

  const agentModel = await getAgentModel('extraction');
  const { data } = await callLlmJson<ExtractionResult>(
    [
      { role: 'system', content: extractionAgent.systemPrompt + '\n\n' + leadContext },
      ...history,
    ],
    { leadId, agentName: 'extraction', model: agentModel },
  );

  return data;
}

// ─── Data Application ───────────────────────────────────────

async function applyExtractedData(
  sessionId: string,
  leadId: string,
  data: ExtractionResult,
): Promise<void> {
  // Update lead name if extracted
  if (typeof data.name === 'string' && data.name.trim()) {
    await prisma.lead.update({
      where: { id: leadId },
      data: { name: data.name.trim().substring(0, 100), status: 'QUALIFIED' },
    });
    await trackEvent(leadId, 'QUALIFIED', { name: data.name });
  }

  // Build preference updates (exclude one-time signals)
  const SIGNAL_KEYS = new Set(['name', 'newSession', 'changePackage', 'regenerateQr', 'dataConfirmed', 'upgradeAccepted', 'characterChoice']);
  const prefUpdates: Record<string, unknown> = {};

  // Resolve character choice to actual character entity
  if (data.characterChoice) {
    const characters = await prisma.character.findMany({
      where: { isActive: true },
      select: { id: true, name: true, slug: true, franchise: true },
      orderBy: { name: 'asc' },
    });
    const choice = data.characterChoice.toLowerCase().trim();

    // 1. Exact match by name or slug
    let match = characters.find((c) =>
      c.name.toLowerCase() === choice || c.slug.toLowerCase() === choice,
    );

    // 2. Match by number
    if (!match) {
      const num = parseInt(choice, 10);
      if (!isNaN(num) && num >= 1 && num <= characters.length) {
        match = characters[num - 1];
      }
    }

    // 3. Partial name match
    if (!match) {
      match = characters.find((c) =>
        c.name.toLowerCase().includes(choice) || choice.includes(c.name.toLowerCase()),
      );
    }

    // 4. Match by franchise — if only one character in that franchise, auto-select
    if (!match) {
      const franchiseMatches = characters.filter((c) =>
        c.franchise && (
          c.franchise.toLowerCase() === choice ||
          c.franchise.toLowerCase().includes(choice) ||
          choice.includes(c.franchise.toLowerCase())
        ),
      );
      if (franchiseMatches.length === 1) {
        match = franchiseMatches[0];
      }
      // If multiple characters in franchise, don't auto-select — the conversation agent
      // will list them for the client to choose
    }

    if (match) {
      prefUpdates.characterId = match.id;
      prefUpdates.characterName = match.name;
      log.info({ choice: data.characterChoice, resolved: match.name }, '[DATA:CHARACTER] Resolved');
    } else {
      log.warn({ choice: data.characterChoice }, '[DATA:CHARACTER] Could not resolve');
    }
  }

  for (const [key, value] of Object.entries(data)) {
    if (SIGNAL_KEYS.has(key) || value === null || value === undefined) continue;

    if (key === 'packageId' && (typeof value !== 'string' || !VALID_PACKAGE_IDS.has(value))) {
      log.warn({ key, value }, '[DATA:VALIDATE] Invalid packageId — discarded');
      continue;
    }
    if (key === 'messageType' && typeof value === 'string' && !VALID_MESSAGE_TYPES.has(value)) {
      log.warn({ key, value }, '[DATA:VALIDATE] Unknown message type — storing anyway');
    }

    prefUpdates[key] = value;
  }

  // Handle upgrade acceptance → force packageId to pkg_3 (Plano Surpresa)
  if (data.upgradeAccepted === true && !prefUpdates.packageId) {
    prefUpdates.packageId = 'pkg_3';
    log.info('[DATA:UPGRADE] Customer accepted upsell → pkg_3');
  }

  if (Object.keys(prefUpdates).length === 0) return;

  const session = await prisma.leadSession.findUnique({ where: { id: sessionId } });
  const current = (session?.preferences as Record<string, unknown>) ?? {};
  const merged = { ...current, ...prefUpdates };

  // Clean stale data when message type changes
  if (typeof prefUpdates.messageType === 'string' && current.messageType && prefUpdates.messageType !== current.messageType) {
    for (const field of ['recipientAge', 'customMessage']) {
      delete merged[field];
    }
    log.info({ old: current.messageType, new: prefUpdates.messageType }, '[DATA:CLEANUP] Message type changed');
  }

  // Clear priceOverride when package changes
  if (typeof prefUpdates.packageId === 'string' && current.packageId && prefUpdates.packageId !== current.packageId) {
    delete merged.priceOverride;
    log.info({ old: current.packageId, new: prefUpdates.packageId }, '[DATA:CLEANUP] Package changed');
  }

  // Apply promo pricing for pkg_3 when earned via upsell
  if (merged.packageId === 'pkg_3' && !merged.priceOverride) {
    if (data.upgradeAccepted === true) {
      log.info('[DATA:PROMO] Upsell accepted for pkg_3');
    }
  }

  await prisma.leadSession.update({
    where: { id: sessionId },
    data: { preferences: merged as any },
  });
}

// ─── Transition Helpers ─────────────────────────────────────

function isVideoDataComplete(prefs: Record<string, unknown>): boolean {
  if (!prefs.characterId) return false;
  if (!prefs.recipientName) return false;
  if (!prefs.customMessage && !prefs.autoMessage) return false;
  return true;
}

async function transitionState(
  sessionId: string,
  leadId: string,
  from: FunnelState,
  to: FunnelState,
): Promise<void> {
  if (!canTransition(from, to)) {
    log.warn({ from, to }, '[STATE] Invalid transition — blocked');
    return;
  }
  await prisma.leadSession.update({
    where: { id: sessionId },
    data: { funnelState: to },
  });
  log.info({ from, to }, '[STATE] ✅ Transitioned');
  await trackEvent(leadId, 'FUNNEL_TRANSITION', { from, to });
}

async function createPixAndTransition(
  sessionId: string,
  leadId: string,
  phone: string,
  fromState: FunnelState,
): Promise<void> {
  log.info({ sessionId, fromState }, '[PIX] Creating payment...');
  await prisma.lead.update({ where: { id: leadId }, data: { status: 'PAYING' } });

  const { qrImageUrl, pixCopyPaste, amount } = await initiatePixPayment(sessionId, leadId);
  log.info({ url: qrImageUrl.substring(0, 80) }, '[PIX] Payment created');

  await transitionState(sessionId, leadId, fromState, FUNNEL_STATES.AWAITING_PAYMENT);

  // Send QR code image
  const paymentAccountName = await getSetting(SETTING_KEYS.PAYMENT_ACCOUNT_NAME);
  const caption = MESSAGES.pixPayment(amount, paymentAccountName || undefined);
  await queueMediaMessage(phone, qrImageUrl, {
    mediatype: 'image',
    mimetype: 'image/png',
    caption,
  });
  await logOutboundMessage(leadId, `[QR Code Pix] ${caption}`, 'image');

  // Wait for QR to arrive, then send copy-paste code
  await new Promise((r) => setTimeout(r, 3000));
  const copyPasteMsg = MESSAGES.pixCopyPaste(pixCopyPaste);
  await queueTextMessage(phone, copyPasteMsg);
  await logOutboundMessage(leadId, copyPasteMsg);

  // Wait, then send hint
  await new Promise((r) => setTimeout(r, 3000));
  const hintMsg = MESSAGES.pixCopyPasteHint();
  await queueTextMessage(phone, hintMsg);
  await logOutboundMessage(leadId, hintMsg);

  await trackEvent(leadId, 'PIX_QR_SENT');
  log.info('[PIX] Done — QR sent');
}

// ─── Follow-up Context ──────────────────────────────────────

function buildFollowUpContext(isFollowUp: boolean, followUpTier?: number): string {
  if (!isFollowUp) return '';

  const tierContent = followUpTier === 2
    ? '- Já faz algumas HORAS que o cliente não responde.\n' +
      '- Pergunte se está tudo bem e se ficou com alguma dúvida.\n' +
      '- Tom: gentil, sem pressão, mostrando disponibilidade.'
    : '- Já faz MUITAS HORAS que o cliente não responde. Pode ser o último contato.\n' +
      '- Envie mensagem carinhosa de "porta aberta" — sem urgência.\n' +
      '- Tom: acolhedor, sem cobrar, como quem deixa a porta aberta.';

  return '\n\n--- FOLLOW-UP AUTOMÁTICO (nível ' + followUpTier + ') ---\n' +
    'O cliente não respondeu há algum tempo. A última mensagem foi SUA (assistente).\n' +
    'Envie UMA mensagem curta e amigável para retomar.\n' +
    tierContent + '\n' +
    '- NÃO repita mensagens anteriores — reformule com naturalidade.\n';
}

// ─── Follow-up Scheduling ───────────────────────────────────

async function scheduleFollowUps(phone: string, leadId: string, currentTier?: number): Promise<void> {
  const batchQueue = getQueue(QUEUE_NAMES.MESSAGE_BATCH);
  const tier1Delay = await getSettingNumber(SETTING_KEYS.STALE_FOLLOWUP_DELAY_MS) || 300_000;
  const TIERS = [
    { tier: 1, delay: tier1Delay },
    { tier: 2, delay: 3 * 60 * 60_000 },
    { tier: 3, delay: 5 * 60 * 60_000 },
  ];

  const startFrom = currentTier ? currentTier + 1 : 1;

  for (const { tier, delay } of TIERS) {
    if (tier < startFrom) continue;
    const jobId = `followup_${phone}_t${tier}`;

    const existing = await batchQueue.getJob(jobId);
    if (existing) {
      const jState = await existing.getState();
      if (jState === 'delayed' || jState === 'waiting') {
        await existing.remove();
      }
    }

    await batchQueue.add(
      'process-batch',
      { phone, leadId, followUpTier: tier } satisfies MessageBatchJobData,
      { jobId, delay, removeOnComplete: true, removeOnFail: true },
    );
  }
  log.info({ phone, startFrom, tier1Delay }, '[FOLLOWUP] Scheduled');
}

// ─── Fallback ───────────────────────────────────────────────

async function handleFallback(phone: string, leadId: string, state: FunnelState): Promise<void> {
  log.info({ state }, '[FALLBACK] Sending fallback');

  let msg: string;
  switch (state) {
    case FUNNEL_STATES.CONVERSATION: {
      const hasHistory = await prisma.conversationMessage.count({
        where: { leadId, direction: 'OUTBOUND' },
      });
      msg = hasHistory > 0
        ? MESSAGES.engagementFollowUp()
        : MESSAGES.welcome(null);
      break;
    }
    case FUNNEL_STATES.AWAITING_PAYMENT:
      msg = MESSAGES.paymentReminder();
      break;
    case FUNNEL_STATES.GENERATING:
      msg = MESSAGES.generationProgress();
      break;
    case FUNNEL_STATES.GALLERY_SENT:
    case FUNNEL_STATES.APPROVING:
      msg = MESSAGES.galleryFallback();
      break;
    case FUNNEL_STATES.DELIVERING:
      msg = MESSAGES.deliveringFallback();
      break;
    case FUNNEL_STATES.DELIVERED:
      msg = MESSAGES.deliveredFallback();
      break;
    default:
      msg = MESSAGES.errorOccurred();
  }

  await queueTextMessage(phone, msg);
  await logOutboundMessage(leadId, msg);
}
