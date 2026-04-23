import type { Job } from 'bullmq';
import { createHash } from 'node:crypto';
import type { VideoGenerationJobData } from '../../shared/queue/queues.js';
import { prisma } from '../../shared/database/prisma.js';
import { getPresignedUrl, uploadFile } from '../../shared/storage/s3.client.js';
import { env } from '../../shared/config/env.js';
import { getPackageById, PACKAGES, OCCASIONS } from '../funnel/packages.config.js';
import { createChildLogger } from '../../shared/utils/logger.js';
import { veo, VeoApiError } from './veo.client.js';
import { nanoBanana, NanoBananaApiError } from './nano-banana.client.js';
import {
  buildCompositePrompt,
  buildVeoMotionPrompt,
  type CompositeCharacter,
} from './composite-frame.builder.js';
import { processGeneratedVideos } from './video-result.processor.js';
import { queueTextMessage, logOutboundMessage } from '../whatsapp/whatsapp.service.js';
import { trackEvent } from '../analytics/analytics.service.js';
import { MESSAGES } from '../funnel/messages.templates.js';
import { FUNNEL_STATES } from '../funnel/funnel.state-machine.v2.js';
import { callLlm } from '../ai/llm.client.js';

const log = createChildLogger('video-gen-worker');
const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_ATTEMPTS = 90; // ~15 min max

/** Per-video preference shape (what the funnel collects per requested video). */
interface VideoSpec {
  /** All characters in the slot (1–3). The first one speaks the script. */
  characterIds: string[];
  script: string;
  /** Persisted cache key + S3 path of the composite starting frame, if any. */
  cachedFrameKey?: string;
  cachedFrameS3Key?: string;
  /** Slot index (1-based) so we can write back updated cache info. */
  slotIndex: number;
}

/**
 * Worker that generates videos via Google Veo (Gemini API).
 *
 * Inputs come from the lead session preferences:
 *   prefs.videos: VideoSpec[]   (one entry per video the user purchased)
 *
 * For backward compatibility, if `prefs.videos` is missing we fall back to
 * a single video built from `prefs.characterId` + `prefs.customMessage`,
 * repeated `package.videos` times.
 */
export async function processVideoGeneration(
  job: Job<VideoGenerationJobData>,
): Promise<void> {
  const { leadSessionId, generationJobId } = job.data;

  log.info({ leadSessionId, generationJobId, jobId: job.id }, 'Starting video generation');

  const session = await prisma.leadSession.findUnique({
    where: { id: leadSessionId },
    include: { lead: true },
  });

  if (!session) {
    log.error({ leadSessionId }, 'Session not found');
    throw new Error('Session not found');
  }

  const payment = await prisma.payment.findFirst({
    where: { leadSessionId, status: 'APPROVED' },
  });

  if (!payment) {
    log.error({ leadSessionId }, 'No approved payment found â€” aborting generation');
    throw new Error('Payment not found');
  }

  try {
    await prisma.generationJob.update({
      where: { id: generationJobId },
      data: { status: 'PROCESSING', startedAt: new Date() },
    });

    const prefs = (session.preferences as Record<string, unknown>) ?? {};
    const pkg = getPackageById(prefs.packageId as string) ?? PACKAGES[PACKAGES.length - 1];
    const expectedCount = pkg.videos ?? 1;
    const recipientName = (prefs.recipientName as string) ?? '';
    const messageType = (prefs.messageType as string) ?? 'default';
    const aspectRatio = env.VIDEO_ASPECT_RATIO;

    // Build the list of videos to generate.
    const specs = await resolveVideoSpecs(prefs, expectedCount);
    if (specs.length === 0) {
      throw new Error('No video specs available — missing characters or script in session preferences');
    }

    // Load all characters across all specs (de-duped).
    const allCharIds = [...new Set(specs.flatMap((s) => s.characterIds))];
    const characters = await prisma.character.findMany({
      where: { id: { in: allCharIds } },
    });
    const charById = new Map(characters.map((c) => [c.id, c]));

    // For each slot: ensure a starting frame (composite via Nano Banana, cached in S3).
    const startingFrames: Array<{ base64: string; mimeType: string } | null> = [];
    const promptsForVeo: string[] = [];
    const updatedSlots: Array<{ index: number; frameKey: string; frameS3Key: string } | null> = [];

    for (const spec of specs) {
      const slotChars: CompositeCharacter[] = spec.characterIds.map((id) => {
        const c = charById.get(id);
        if (!c) throw new Error(`Character ${id} not found`);
        return { name: c.name, description: c.description ?? undefined };
      });

      const frameKey = computeFrameKey({
        characterIds: spec.characterIds,
        recipientName,
        messageType,
        aspectRatio,
      });

      let frame: { base64: string; mimeType: string } | null = null;

      // Cache hit?
      if (spec.cachedFrameKey === frameKey && spec.cachedFrameS3Key) {
        try {
          const url = await getPresignedUrl(spec.cachedFrameS3Key, 600);
          const res = await fetch(url);
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            frame = { base64: buf.toString('base64'), mimeType: res.headers.get('content-type') ?? 'image/png' };
            log.info({ slot: spec.slotIndex, frameKey }, '[COMPOSITE] cache hit');
          }
        } catch (err) {
          log.warn({ err, frameKey }, '[COMPOSITE] cache lookup failed — will regenerate');
        }
      }

      // Generate composite frame if no cache hit.
      if (!frame) {
        try {
          frame = await generateCompositeFrame({
            characters: slotChars,
            characterIds: spec.characterIds,
            charById,
            recipientName,
            messageType,
            aspectRatio,
          });
          // Persist to S3 and remember in the slot for next time.
          const s3Key = `composite-frames/${frameKey}.png`;
          await uploadFile(s3Key, Buffer.from(frame.base64, 'base64'), frame.mimeType);
          updatedSlots.push({ index: spec.slotIndex, frameKey, frameS3Key: s3Key });
          log.info({ slot: spec.slotIndex, frameKey, s3Key }, '[COMPOSITE] generated + cached');
        } catch (err) {
          log.error({ err, slot: spec.slotIndex }, '[COMPOSITE] generation failed — falling back to first character ref');
          frame = await loadFirstCharacterReference(spec.characterIds[0], charById);
          updatedSlots.push(null);
        }
      } else {
        updatedSlots.push(null);
      }

      startingFrames.push(frame);
      promptsForVeo.push(buildVeoMotionPrompt({
        characters: slotChars,
        speakerIndex: 0,
        occasion: messageType,
        script: spec.script,
      }));
    }

    // Persist any new cache info back into session.preferences.videos[].
    await persistFrameCacheUpdates(leadSessionId, updatedSlots);

    await prisma.generationJob.update({
      where: { id: generationJobId },
      data: { prompt: promptsForVeo[0] },
    });

    // Submit all videos to Veo in parallel.
    const submissions = await Promise.all(
      promptsForVeo.map((prompt, i) =>
        veo.submitGeneration({
          prompt,
          imageBase64: startingFrames[i]?.base64,
          imageMimeType: startingFrames[i]?.mimeType,
        }).catch((err) => {
          log.error({ err, index: i }, 'Veo submit failed for video');
          return null;
        }),
      ),
    );

    const operationNames = submissions
      .map((s) => s?.operationName)
      .filter((n): n is string => typeof n === 'string');

    if (operationNames.length === 0) {
      throw new Error('All Veo submissions failed');
    }

    await prisma.generationJob.update({
      where: { id: generationJobId },
      data: { externalJobId: operationNames.join(',') },
    });

    log.info({ operationNames, count: operationNames.length }, 'Veo operations submitted');

    await prisma.leadSession.update({
      where: { id: leadSessionId },
      data: { funnelState: FUNNEL_STATES.GENERATING },
    });
    await prisma.lead.update({
      where: { id: session.leadId },
      data: { status: 'GENERATING' },
    });

    const progressMsg = MESSAGES.generationProgress();
    await queueTextMessage(session.lead.phone, progressMsg);
    await logOutboundMessage(session.leadId, progressMsg);

    const completed = await pollVideoOperations(operationNames);

    const failed = expectedCount - completed.length;
    if (completed.length === 0) {
      throw new Error('No videos returned by Veo');
    }
    if (failed > 0) {
      log.warn({ expected: expectedCount, delivered: completed.length, failed }, 'Partial generation');
    }

    const videoIds = await processGeneratedVideos(
      completed.map((c) => ({
        videoUri: c.videoUri!,
        durationSeconds: env.VIDEO_DURATION,
        aspectRatio: env.VIDEO_ASPECT_RATIO,
        resolution: env.VIDEO_RESOLUTION,
      })),
      generationJobId,
      leadSessionId,
    );

    await prisma.generationJob.update({
      where: { id: generationJobId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    await prisma.leadSession.update({
      where: { id: leadSessionId },
      data: {
        funnelState: FUNNEL_STATES.GALLERY_SENT,
        metadata: {
          ...(session.metadata as Record<string, unknown>),
          expectedVideos: expectedCount,
          deliveredVideos: completed.length,
          failedVideos: failed,
        },
      },
    });

    await prisma.lead.update({
      where: { id: session.leadId },
      data: { status: 'APPROVING' },
    });

    await trackEvent(session.leadId, 'VIDEOS_GENERATED', {
      count: completed.length,
      expected: expectedCount,
      failed,
      generationJobId,
    });

    const doneMsg = MESSAGES.generationComplete?.() ?? 'âœ… Seus vÃ­deos ficaram prontos! Em breve enviaremos para aprovaÃ§Ã£o.';
    await queueTextMessage(session.lead.phone, doneMsg);
    await logOutboundMessage(session.leadId, doneMsg);

    log.info({ leadSessionId, videoCount: completed.length, generationJobId, videoIds }, 'Video generation completed');
  } catch (error) {
    log.error({ leadSessionId, generationJobId, error }, 'Video generation failed');

    await prisma.generationJob.update({
      where: { id: generationJobId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      },
    });

    await trackEvent(session.leadId, 'VIDEO_GENERATION_FAILED', {
      generationJobId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
}

/**
 * Resolve the per-video specs from session preferences. Supports:
 *   - prefs.videos: [{ characterIds: string[], customMessage?, autoMessage?, frameKey?, frameS3Key? }, ...]   (current)
 *   - prefs.videos: [{ characterId, ... }, ...]                                                                (legacy single-char per slot)
 *   - prefs.characterId + prefs.customMessage                                                                  (legacy top-level)
 *
 * For slots with autoMessage:true (no customMessage), generate a script
 * via OpenAI using the recipient + occasion context.
 */
async function resolveVideoSpecs(
  prefs: Record<string, unknown>,
  expectedCount: number,
): Promise<VideoSpec[]> {
  const recipientName = (prefs.recipientName as string) ?? '';
  const recipientAge = (prefs.recipientAge as string) ?? '';
  const messageType = (prefs.messageType as string) ?? 'default';

  // Pull raw slot data
  const rawVideos = Array.isArray(prefs.videos) ? (prefs.videos as Array<Record<string, unknown>>) : [];
  interface Candidate {
    characterIds: string[];
    script?: string;
    autoMessage: boolean;
    cachedFrameKey?: string;
    cachedFrameS3Key?: string;
    slotIndex: number; // 1-based
  }
  const fromSlots: Candidate[] = [];

  for (let i = 0; i < rawVideos.length; i++) {
    const v = rawVideos[i];
    if (!v) continue;
    const characterIds = readCharacterIds(v);
    if (characterIds.length === 0) continue;
    const customMessage = typeof v.customMessage === 'string' ? v.customMessage.trim() : '';
    const autoMessage = v.autoMessage === true || customMessage.length === 0;
    fromSlots.push({
      characterIds,
      script: customMessage || undefined,
      autoMessage,
      cachedFrameKey: typeof v.frameKey === 'string' ? v.frameKey : undefined,
      cachedFrameS3Key: typeof v.frameS3Key === 'string' ? v.frameS3Key : undefined,
      slotIndex: i + 1,
    });
  }

  let candidates = fromSlots;

  // Legacy fallback: single character + customMessage repeated for the package count
  if (candidates.length === 0) {
    const characterId = typeof prefs.characterId === 'string' ? prefs.characterId : null;
    const customMessage = typeof prefs.customMessage === 'string' ? prefs.customMessage.trim() : '';
    if (characterId) {
      candidates = Array.from({ length: expectedCount }, (_, i) => ({
        characterIds: [characterId],
        script: customMessage || undefined,
        autoMessage: customMessage.length === 0,
        slotIndex: i + 1,
      }));
    }
  }

  if (candidates.length === 0) return [];

  // Generate scripts for any slot that needs one
  const allCharIds = [...new Set(candidates.flatMap((c) => c.characterIds))];
  const characters = await prisma.character.findMany({ where: { id: { in: allCharIds } } });
  const charById = new Map(characters.map((c) => [c.id, c]));

  const specs: VideoSpec[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    let script = c.script;
    const speaker = charById.get(c.characterIds[0]);
    if (!script && c.autoMessage) {
      script = await generateAutoScript({
        characterDescription: speaker?.description ?? null,
        recipientName,
        recipientAge,
        messageType,
        videoIndex: i + 1,
        totalVideos: candidates.length,
      });
    } else if (script && countWords(script) < MIN_SCRIPT_WORDS) {
      // Custom message is too short to fill the ~8s clip — extend it while
      // preserving the user's exact wording. Veo quality drops dramatically
      // when the spoken line is too short (awkward silence, lip-flap drift).
      script = await extendCustomScript({
        userMessage: script,
        characterDescription: speaker?.description ?? null,
        recipientName,
        recipientAge,
        messageType,
      });
    }
    if (script && script.trim().length > 0) {
      specs.push({
        characterIds: c.characterIds,
        script: script.trim(),
        cachedFrameKey: c.cachedFrameKey,
        cachedFrameS3Key: c.cachedFrameS3Key,
        slotIndex: c.slotIndex,
      });
    } else {
      log.warn({ slot: c.slotIndex }, 'Slot has no script and auto-script generation failed');
    }
  }

  return specs;
}

/** Read character IDs from a slot, supporting both new (characterIds[]) and legacy (characterId) shapes. */
function readCharacterIds(slot: Record<string, unknown>): string[] {
  if (Array.isArray(slot.characterIds)) {
    return (slot.characterIds as unknown[]).filter((x): x is string => typeof x === 'string');
  }
  if (typeof slot.characterId === 'string') return [slot.characterId];
  return [];
}

/**
 * Stable hash for cache lookup of composite starting frames. Identical inputs
 * across leads share the same S3 object — so popular character/occasion/name
 * combos pay the Nano Banana cost only once.
 */
function computeFrameKey(input: {
  characterIds: string[];
  recipientName: string;
  messageType: string;
  aspectRatio: string;
}): string {
  const sortedIds = [...input.characterIds].sort();
  const payload = JSON.stringify({
    c: sortedIds,
    n: input.recipientName.trim().toLowerCase(),
    m: input.messageType,
    a: input.aspectRatio,
  });
  return createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

/**
 * Generate a composite starting frame via Nano Banana using each character's
 * reference images as anchors plus an occasion-specific scene prompt.
 */
async function generateCompositeFrame(input: {
  characters: CompositeCharacter[];
  characterIds: string[];
  charById: Map<string, { id: string; name: string; referenceImageS3Keys: unknown }>;
  recipientName: string;
  messageType: string;
  aspectRatio: '16:9' | '9:16';
}): Promise<{ base64: string; mimeType: string }> {
  // Load one reference image per character (the first available).
  const referenceImages: Array<{ base64: string; mimeType: string }> = [];
  for (const id of input.characterIds) {
    const char = input.charById.get(id);
    if (!char) continue;
    const refKeys = Array.isArray(char.referenceImageS3Keys)
      ? (char.referenceImageS3Keys as string[])
      : [];
    if (refKeys.length === 0) {
      log.warn({ characterId: id }, '[COMPOSITE] character has no reference image — skipping ref');
      continue;
    }
    try {
      const url = await getPresignedUrl(refKeys[0], 600);
      const res = await fetch(url);
      if (!res.ok) {
        log.warn({ characterId: id, status: res.status }, '[COMPOSITE] failed to download character ref');
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      referenceImages.push({
        base64: buf.toString('base64'),
        mimeType: res.headers.get('content-type') ?? 'image/jpeg',
      });
    } catch (err) {
      log.warn({ err, characterId: id }, '[COMPOSITE] reference image fetch failed');
    }
  }

  const prompt = buildCompositePrompt({
    characters: input.characters,
    recipientName: input.recipientName,
    occasion: input.messageType,
    aspectRatio: input.aspectRatio,
  });

  const result = await nanoBanana.generateComposite({
    prompt,
    referenceImages,
    aspectRatio: input.aspectRatio,
  });

  return { base64: result.imageBase64, mimeType: result.mimeType };
}

/** Fallback when the composite step fails — use the first character's raw reference image. */
async function loadFirstCharacterReference(
  characterId: string,
  charById: Map<string, { id: string; name: string; referenceImageS3Keys: unknown }>,
): Promise<{ base64: string; mimeType: string } | null> {
  const char = charById.get(characterId);
  if (!char) return null;
  const refKeys = Array.isArray(char.referenceImageS3Keys)
    ? (char.referenceImageS3Keys as string[])
    : [];
  if (refKeys.length === 0) return null;
  try {
    const url = await getPresignedUrl(refKeys[0], 600);
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      base64: buf.toString('base64'),
      mimeType: res.headers.get('content-type') ?? 'image/jpeg',
    };
  } catch {
    return null;
  }
}

/**
 * Persist new frame cache info back into session.preferences.videos[]. We
 * read-modify-write because the funnel may have updated other slots in
 * the meantime; we only touch the slots we just generated frames for.
 */
async function persistFrameCacheUpdates(
  leadSessionId: string,
  updates: Array<{ index: number; frameKey: string; frameS3Key: string } | null>,
): Promise<void> {
  const real = updates.filter((u): u is { index: number; frameKey: string; frameS3Key: string } => u !== null);
  if (real.length === 0) return;

  const session = await prisma.leadSession.findUnique({ where: { id: leadSessionId } });
  if (!session) return;
  const prefs = (session.preferences as Record<string, unknown>) ?? {};
  const videos = Array.isArray(prefs.videos) ? [...(prefs.videos as Array<Record<string, unknown>>)] : [];

  for (const u of real) {
    const idx = u.index - 1;
    if (idx < 0 || idx >= videos.length) continue;
    videos[idx] = { ...videos[idx], frameKey: u.frameKey, frameS3Key: u.frameS3Key };
  }

  await prisma.leadSession.update({
    where: { id: leadSessionId },
    data: { preferences: { ...prefs, videos } as any },
  });
}

/**
 * Minimum spoken-word count for a video script. Veo clips are ~8s and
 * Brazilian-Portuguese speech runs ~7–8 words/sec, so anything under
 * ~50 words leaves dead air at the end (lip-flap, awkward pauses, model
 * filling with random gestures). 60 is our safe floor.
 */
const MIN_SCRIPT_WORDS = 60;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Use the LLM to write a 60-100 word Portuguese script for the character
 * to speak. Returned as plain text (no quotes, no stage directions).
 *
 * The prompt describes the character by ARCHETYPE (description field) and
 * personality — NOT by the trademarked name — to avoid content-policy blocks
 * on IP-heavy names (e.g. "Capíтão Gancho", "Mickey"). Retries up to 3 times
 * on empty/failed LLM output before falling back to a generic template.
 */
async function generateAutoScript(params: {
  characterDescription: string | null;
  recipientName: string;
  recipientAge: string;
  messageType: string;
  videoIndex: number;
  totalVideos: number;
}): Promise<string> {
  const occasion = OCCASIONS[params.messageType]?.label?.toLowerCase() ?? 'carinhosa geral';
  const ageHint = params.recipientAge ? ` (${params.recipientAge} anos)` : '';
  const variationHint = params.totalVideos > 1
    ? `\n- Este é o vídeo ${params.videoIndex} de ${params.totalVideos} — faça uma versão única, diferente das demais.`
    : '';

  // Use the character's *archetype description* as the subject of the prompt,
  // not the character name. This avoids both IP trouble and content-filter blocks.
  const archetype = params.characterDescription?.trim() || 'um personagem infantil carismático';

  const prompt = `Você está escrevendo a fala de um personagem fictício para um vídeo cameo infantil de presente. A criança ${params.recipientName}${ageHint} vai assistir a esse vídeo. A fala precisa ser 100% positiva, carinhosa, segura e adequada para criança.

Personagem: ${archetype}

Ocasião: ${occasion}

Escreva 60 a 100 palavras em português brasileiro:
- Fala direta para ${params.recipientName}, em tom alegre e acolhedor
- Use o JEITO DE FALAR e maneirismos do personagem (vocabulário, bordões, ritmo), mas o conteúdo deve ser carinhoso e apropriado para criança
- Comece com uma saudação chamando ${params.recipientName} pelo nome
- Inclua algo coerente com a ocasião (${occasion})
- Termine com uma despedida calorosa
- Sem narração, sem indicações de cena, sem aspas
- Apenas o texto que o personagem fala${variationHint}`;

  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { content } = await callLlm(
        [
          { role: 'system', content: 'You write short, wholesome, kid-safe character cameo greetings in Brazilian Portuguese. The output is for children. Always produce a positive, affectionate message regardless of the character\'s canonical personality — channel only their voice/mannerisms, never negative traits.' },
          { role: 'user', content: prompt },
        ],
        { agentName: 'auto-script', model: env.OPENAI_MODEL },
      );
      const cleaned = content.trim().replace(/^["“]+|["”]+$/g, '').trim();
      if (cleaned.length > 0) {
        if (attempt > 1) log.info({ attempt }, '[AUTO_SCRIPT] succeeded on retry');
        return cleaned;
      }
      log.warn({ attempt, archetype, recipientName: params.recipientName }, '[AUTO_SCRIPT] LLM returned empty content — retrying');
    } catch (err) {
      log.warn({ err, attempt }, '[AUTO_SCRIPT] LLM call failed — retrying');
    }
  }

  log.error({ archetype }, '[AUTO_SCRIPT] All attempts failed — using fallback template');
  // Minimal fallback so we still produce something coherent.
  return `Oi ${params.recipientName}! Vim mandar um recadinho muito especial pra você hoje. Saiba que você é incrível e merece tudo de bom. Te desejo muita alegria, saúde e momentos felizes. Um beijão enorme!`;
}

/**
 * Extend a short user-provided custom message to fill the ~8s Veo clip
 * (~60–100 words). The user's exact wording, names, and intent MUST be
 * preserved — we only add natural greeting/closing lines around it in the
 * character's voice. Retries up to 3 times on empty/failed output and
 * falls back to padding the original message if all attempts fail.
 */
async function extendCustomScript(params: {
  userMessage: string;
  characterDescription: string | null;
  recipientName: string;
  recipientAge: string;
  messageType: string;
}): Promise<string> {
  const occasion = OCCASIONS[params.messageType]?.label?.toLowerCase() ?? 'carinhosa geral';
  const ageHint = params.recipientAge ? ` (${params.recipientAge} anos)` : '';
  const archetype = params.characterDescription?.trim() || 'um personagem infantil carismático';

  const prompt = `Você é roteirista de uma fala curta (60–100 palavras) em português brasileiro para ${archetype} falar diretamente para a criança ${params.recipientName}${ageHint} num vídeo cameo de ${occasion}. A fala deve ser 100% positiva, carinhosa e apropriada para criança.

O cliente já escreveu a mensagem que deseja transmitir. Sua tarefa é EXPANDIR essa mensagem para preencher o vídeo de ~8 segundos, MANTENDO INTACTAS as palavras-chave, nomes e intenção original do cliente.

Mensagem original do cliente (DEVE aparecer integralmente, sem alterar nomes ou frases-chave):
"""
${params.userMessage}
"""

Como expandir:
- Comece com uma saudação curta no estilo do personagem direcionada a ${params.recipientName}
- Inclua a mensagem original do cliente de forma natural no meio da fala (pode reformular conectivos, mas NÃO altere nomes próprios nem o sentido)
- Termine com uma despedida calorosa coerente com a ocasião
- Total: 60 a 100 palavras
- Tom natural, falado, sem narração ou indicações de cena
- Sem aspas no início ou fim
- Apenas o texto da fala`;

  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { content } = await callLlm(
        [
          { role: 'system', content: 'You expand short user-provided greeting messages into fluent character speech in Brazilian Portuguese for a kid-safe cameo video. Always preserve the user\'s original wording, names, and intent. Output is for children — keep content positive and wholesome regardless of the character\'s canonical personality.' },
          { role: 'user', content: prompt },
        ],
        { agentName: 'extend-script', model: env.OPENAI_MODEL },
      );
      const cleaned = content.trim().replace(/^["“]+|["”]+$/g, '').trim();
      if (cleaned.length > 0 && countWords(cleaned) >= MIN_SCRIPT_WORDS - 10) {
        if (attempt > 1) log.info({ attempt }, '[EXTEND_SCRIPT] succeeded on retry');
        return cleaned;
      }
      log.warn({ attempt, words: cleaned ? countWords(cleaned) : 0 }, '[EXTEND_SCRIPT] output too short or empty — retrying');
    } catch (err) {
      log.warn({ err, attempt }, '[EXTEND_SCRIPT] LLM call failed — retrying');
    }
  }

  log.error({ recipientName: params.recipientName }, '[EXTEND_SCRIPT] All attempts failed — padding original message');
  // Fallback: pad the user's message with a generic intro and outro so it
  // still fills the clip while preserving their words verbatim.
  return `Oi ${params.recipientName}! Vim aqui só pra você. ${params.userMessage} Te desejo muita alegria, momentos felizes e tudo de melhor. Um beijão enorme, viu? Até a próxima!`;
}

async function pollVideoOperations(
  operationNames: string[],
): Promise<Array<{ operationName: string; videoUri: string }>> {
  const completed: Array<{ operationName: string; videoUri: string }> = [];
  const pending = new Set(operationNames);

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS && pending.size > 0; attempt++) {
    await sleep(POLL_INTERVAL_MS);

    for (const op of [...pending]) {
      try {
        const result = await veo.getStatus(op);
        if (result.status === 'done' && result.videoUri) {
          completed.push({ operationName: op, videoUri: result.videoUri });
          pending.delete(op);
          log.debug({ operationName: op, attempt }, 'Veo operation completed');
        } else if (result.status === 'failed') {
          pending.delete(op);
          log.warn({ operationName: op, error: result.error }, 'Veo operation failed');
        }
      } catch (err) {
        if (err instanceof VeoApiError) {
          log.error({ operationName: op, code: err.code, attempt }, 'Veo poll error (retrying)');
        } else {
          log.error({ operationName: op, attempt, err }, 'Veo poll error (retrying)');
        }
      }
    }

    if (pending.size > 0) {
      log.debug({ pending: pending.size, completed: completed.length, attempt }, 'Polling progress');
    }
  }

  if (pending.size > 0) {
    log.warn({ timedOut: [...pending] }, 'Some Veo operations timed out');
  }

  return completed;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
