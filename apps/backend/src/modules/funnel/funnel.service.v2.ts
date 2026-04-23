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
import { PACKAGES, OCCASIONS, getPackageById } from './packages.config.js';

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
      // Carry over only the package and (optionally) the recipient + occasion.
      // Per-video character/script choices are NOT carried — the customer
      // gets a fresh slate for the new order.
      for (const key of ['packageId', 'messageType', 'recipientName', 'recipientAge']) {
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

  // Build preference updates (exclude one-time signals + handled-separately keys)
  const SIGNAL_KEYS = new Set([
    'name', 'newSession', 'changePackage', 'regenerateQr', 'dataConfirmed', 'upgradeAccepted',
    'characterChoice', 'customMessage', 'autoMessage', 'videos',
  ]);
  const prefUpdates: Record<string, unknown> = {};

  // Load characters once for any choice resolution we need
  const characters = await prisma.character.findMany({
    where: { isActive: true },
    select: { id: true, name: true, slug: true, franchise: true },
    orderBy: { name: 'asc' },
  });

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

  // Load existing session to merge per-video state
  const session = await prisma.leadSession.findUnique({ where: { id: sessionId } });
  const current = (session?.preferences as Record<string, unknown>) ?? {};
  const merged: Record<string, unknown> = { ...current, ...prefUpdates };

  // Determine the current video count from the (possibly updated) packageId
  const pkgId = (merged.packageId ?? current.packageId) as string | undefined;
  const pkg = pkgId ? getPackageById(pkgId) : undefined;
  const totalVideos = pkg?.videos ?? 0;

  // Enforce occasion lock — packages like pkg_aniv_1 force messageType to a fixed value
  if (pkg?.occasionLock && merged.messageType !== pkg.occasionLock) {
    log.info({ pkgId, lock: pkg.occasionLock }, '[DATA:OCCASION_LOCK] Forcing messageType');
    merged.messageType = pkg.occasionLock;
  }

  // Initialize / resize the videos array to match the package size
  let videos = Array.isArray(current.videos)
    ? (current.videos as Array<Record<string, unknown>>).map((v) => ({ ...v }))
    : [];

  // Migrate legacy single-video prefs into slot 1 (one-time)
  if (
    videos.length === 0 &&
    (current.characterId || current.customMessage || current.autoMessage)
  ) {
    videos.push({
      characterIds: [current.characterId],
      characterNames: typeof current.characterName === 'string' ? [current.characterName] : [],
      customMessage: current.customMessage,
      autoMessage: current.autoMessage === true ? true : undefined,
    });
  }

  if (totalVideos > 0) {
    if (videos.length < totalVideos) {
      while (videos.length < totalVideos) videos.push({});
    } else if (videos.length > totalVideos) {
      videos = videos.slice(0, totalVideos);
    }
  }

  // Random-character packages: auto-fill any empty slot with a randomly picked active character.
  // The customer never chooses for these packages — the system picks for them.
  if (pkg?.randomCharacter && characters.length > 0) {
    for (const v of videos) {
      const hasIds = Array.isArray(v.characterIds) && (v.characterIds as unknown[]).length > 0;
      const hasLegacyId = typeof v.characterId === 'string' && v.characterId.length > 0;
      if (hasIds || hasLegacyId) continue;
      const pick = characters[Math.floor(Math.random() * characters.length)];
      v.characterIds = [pick.id];
      v.characterNames = [pick.name];
      log.info({ pkgId, characterId: pick.id, name: pick.name }, '[DATA:RANDOM_CHAR] Auto-assigned random character');
    }
  }

  // Apply per-slot extraction (data.videos)
  if (Array.isArray(data.videos)) {
    for (const slotData of data.videos) {
      if (!slotData || typeof slotData.slot !== 'number') continue;
      const idx = slotData.slot - 1;
      if (idx < 0 || idx >= videos.length) {
        log.warn({ slot: slotData.slot, totalVideos }, '[DATA:VIDEO] Slot out of range — ignored');
        continue;
      }
      applyVideoSlot(videos[idx], slotData, characters);
    }
  }

  // Legacy/shortcut top-level fields → route into the next pending slot
  const legacyShortcut = {
    characterChoice: data.characterChoice,
    customMessage: data.customMessage,
    autoMessage: data.autoMessage,
  };
  if (legacyShortcut.characterChoice || legacyShortcut.customMessage || legacyShortcut.autoMessage !== undefined) {
    const targetIdx = videos.findIndex((v) => !isSlotComplete(v));
    if (targetIdx >= 0) {
      applyVideoSlot(videos[targetIdx], {
        slot: targetIdx + 1,
        characterChoice: legacyShortcut.characterChoice,
        customMessage: legacyShortcut.customMessage,
        autoMessage: legacyShortcut.autoMessage,
      }, characters);
    } else if (videos.length > 0) {
      // No pending slot — treat as a correction to the last filled slot
      applyVideoSlot(videos[videos.length - 1], {
        slot: videos.length,
        characterChoice: legacyShortcut.characterChoice,
        customMessage: legacyShortcut.customMessage,
        autoMessage: legacyShortcut.autoMessage,
      }, characters);
    }
  }

  if (videos.length > 0) merged.videos = videos;

  // Clean stale data when message type changes (drop per-video custom messages too)
  if (typeof prefUpdates.messageType === 'string' && current.messageType && prefUpdates.messageType !== current.messageType) {
    delete merged.recipientAge;
    delete merged.customMessage;
    if (Array.isArray(merged.videos)) {
      merged.videos = (merged.videos as Array<Record<string, unknown>>).map((v) => ({
        characterIds: Array.isArray(v.characterIds) ? v.characterIds : (typeof v.characterId === 'string' ? [v.characterId] : []),
        characterNames: Array.isArray(v.characterNames) ? v.characterNames : (typeof v.characterName === 'string' ? [v.characterName] : []),
        // Drop messages and cached frame — message type changed, so the scene differs.
      }));
    }
    log.info({ old: current.messageType, new: prefUpdates.messageType }, '[DATA:CLEANUP] Message type changed');
  }

  // Clear priceOverride when package changes
  if (typeof prefUpdates.packageId === 'string' && current.packageId && prefUpdates.packageId !== current.packageId) {
    delete merged.priceOverride;
    log.info({ old: current.packageId, new: prefUpdates.packageId }, '[DATA:CLEANUP] Package changed');
  }

  // Invalidate cached composite frames when the recipient name changes
  // (the name is rendered into the frame, e.g. on a birthday cake).
  if (
    typeof prefUpdates.recipientName === 'string' &&
    current.recipientName &&
    prefUpdates.recipientName !== current.recipientName &&
    Array.isArray(merged.videos)
  ) {
    merged.videos = (merged.videos as Array<Record<string, unknown>>).map((v) => {
      const { frameKey: _f, frameS3Key: _s, ...rest } = v;
      return rest;
    });
    log.info({ old: current.recipientName, new: prefUpdates.recipientName }, '[DATA:CLEANUP] Recipient name changed — composite frames invalidated');
  }

  // Drop legacy top-level character/message fields once we have a videos array
  if (Array.isArray(merged.videos) && (merged.videos as unknown[]).length > 0) {
    delete merged.characterId;
    delete merged.characterName;
    delete merged.customMessage;
    delete merged.autoMessage;
  }

  if (data.upgradeAccepted === true) {
    log.info('[DATA:PROMO] Upsell accepted for pkg_3');
  }

  await prisma.leadSession.update({
    where: { id: sessionId },
    data: { preferences: merged as any },
  });
}

/** Resolve a character choice string to a character entity (4-step matcher). */
function resolveCharacter(
  choice: string,
  characters: Array<{ id: string; name: string; slug: string; franchise: string | null }>,
): { id: string; name: string } | null {
  const lower = choice.toLowerCase().trim();

  // 1. Exact match by name or slug
  let match = characters.find((c) => c.name.toLowerCase() === lower || c.slug.toLowerCase() === lower);

  // 2. Match by number
  if (!match) {
    const num = parseInt(lower, 10);
    if (!isNaN(num) && num >= 1 && num <= characters.length) match = characters[num - 1];
  }

  // 3. Partial name match
  if (!match) {
    match = characters.find((c) => c.name.toLowerCase().includes(lower) || lower.includes(c.name.toLowerCase()));
  }

  // 4. Franchise match — auto-select only if a single character belongs to the franchise
  if (!match) {
    const franchiseMatches = characters.filter((c) =>
      c.franchise && (
        c.franchise.toLowerCase() === lower ||
        c.franchise.toLowerCase().includes(lower) ||
        lower.includes(c.franchise.toLowerCase())
      ),
    );
    if (franchiseMatches.length === 1) match = franchiseMatches[0];
  }

  return match ? { id: match.id, name: match.name } : null;
}

/** Maximum number of characters that can be composited into a single video. */
const MAX_CHARACTERS_PER_SLOT = 3;

/** Apply a per-slot extraction onto an existing video slot object. */
function applyVideoSlot(
  slot: Record<string, unknown>,
  data: {
    slot: number;
    characterChoices?: string[];
    characterChoice?: string;
    customMessage?: string;
    autoMessage?: boolean;
  },
  characters: Array<{ id: string; name: string; slug: string; franchise: string | null }>,
): void {
  // Normalise to an array (legacy single-choice fallback).
  // Also split joined strings like "Mickey e Minnie" / "Mickey, Minnie" / "Mickey + Minnie".
  const splitChoice = (raw: string): string[] =>
    raw.split(/\s*(?:,| e | & |\+|\/)\s*/i).map((s) => s.trim()).filter((s) => s.length > 0);
  const choices = Array.isArray(data.characterChoices) && data.characterChoices.length > 0
    ? data.characterChoices.flatMap(splitChoice)
    : (data.characterChoice ? splitChoice(data.characterChoice) : []);

  if (choices.length > 0) {
    const resolvedIds: string[] = [];
    const resolvedNames: string[] = [];
    const unresolved: string[] = [];

    for (const choice of choices) {
      if (resolvedIds.length >= MAX_CHARACTERS_PER_SLOT) break;
      const resolved = resolveCharacter(choice, characters);
      if (resolved && !resolvedIds.includes(resolved.id)) {
        resolvedIds.push(resolved.id);
        resolvedNames.push(resolved.name);
      } else if (!resolved) {
        unresolved.push(choice);
      }
    }

    if (resolvedIds.length > 0) {
      const prevIds = readCharacterIds(slot);
      const changed = prevIds.length !== resolvedIds.length || prevIds.some((id, i) => id !== resolvedIds[i]);
      slot.characterIds = resolvedIds;
      slot.characterNames = resolvedNames;
      // Drop legacy single-character fields once the array is populated.
      delete slot.characterId;
      delete slot.characterName;
      // Invalidate any cached composite frame when the cast changes.
      if (changed) {
        delete slot.frameKey;
        delete slot.frameS3Key;
      }
      log.info(
        { slot: data.slot, choices, resolved: resolvedNames, changed },
        '[DATA:VIDEO] Characters resolved',
      );
    }
    if (unresolved.length > 0) {
      log.warn({ slot: data.slot, unresolved }, '[DATA:VIDEO] Some character choices not resolved');
    }
  }

  if (typeof data.customMessage === 'string' && data.customMessage.trim()) {
    slot.customMessage = data.customMessage.trim();
    delete slot.autoMessage;
  } else if (data.autoMessage === true) {
    slot.autoMessage = true;
    delete slot.customMessage;
  }
}

/** Read the character IDs for a slot, supporting both new and legacy shapes. */
function readCharacterIds(slot: Record<string, unknown>): string[] {
  if (Array.isArray(slot.characterIds)) {
    return (slot.characterIds as unknown[]).filter((x): x is string => typeof x === 'string');
  }
  if (typeof slot.characterId === 'string') return [slot.characterId];
  return [];
}

function isSlotComplete(slot: Record<string, unknown>): boolean {
  if (readCharacterIds(slot).length === 0) return false;
  if (!slot.customMessage && slot.autoMessage !== true) return false;
  return true;
}

// ─── Transition Helpers ─────────────────────────────────────

function isVideoDataComplete(prefs: Record<string, unknown>): boolean {
  if (!prefs.recipientName) return false;
  const pkgId = prefs.packageId as string | undefined;
  if (!pkgId) return false;
  const pkg = getPackageById(pkgId);
  if (!pkg) return false;

  const videos = Array.isArray(prefs.videos) ? (prefs.videos as Array<Record<string, unknown>>) : [];
  if (videos.length !== pkg.videos) return false;
  return videos.every(isSlotComplete);
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
