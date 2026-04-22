import type { Job } from 'bullmq';
import type { VideoGenerationJobData } from '../../shared/queue/queues.js';
import { prisma } from '../../shared/database/prisma.js';
import { getPresignedUrl } from '../../shared/storage/s3.client.js';
import { env } from '../../shared/config/env.js';
import { getPackageById, PACKAGES } from '../funnel/packages.config.js';
import { createChildLogger } from '../../shared/utils/logger.js';
import { veo, VeoApiError } from './veo.client.js';
import { buildVideoPromptVariations, type PerVideoPromptInput } from './video-prompt.engine.js';
import { processGeneratedVideos } from './video-result.processor.js';
import { queueTextMessage, logOutboundMessage } from '../whatsapp/whatsapp.service.js';
import { trackEvent } from '../analytics/analytics.service.js';
import { MESSAGES } from '../funnel/messages.templates.js';
import { FUNNEL_STATES } from '../funnel/funnel.state-machine.v2.js';

const log = createChildLogger('video-gen-worker');
const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_ATTEMPTS = 90; // ~15 min max

/** Per-video preference shape (what the funnel collects per requested video). */
interface VideoSpec {
  characterId: string;
  script: string;
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

    // Build the list of videos to generate.
    const specs = await resolveVideoSpecs(prefs, expectedCount);
    if (specs.length === 0) {
      throw new Error('No video specs available â€” missing character or script in session preferences');
    }

    // Load characters for all specs (de-duped).
    const characterIds = [...new Set(specs.map((s) => s.characterId))];
    const characters = await prisma.character.findMany({
      where: { id: { in: characterIds } },
    });
    const charById = new Map(characters.map((c) => [c.id, c]));

    // Build prompt + reference image for each video.
    const promptInputs: PerVideoPromptInput[] = [];
    const imageBuffers: Array<{ base64: string; mimeType: string } | null> = [];

    for (const spec of specs) {
      const character = charById.get(spec.characterId);
      if (!character) throw new Error(`Character ${spec.characterId} not found`);

      promptInputs.push({
        characterName: character.name,
        characterPersonality: character.personality ?? undefined,
        script: spec.script,
      });

      // Use the first reference image as image-to-video starting frame.
      const refKeys = (character.referenceImageS3Keys as string[]) ?? [];
      if (refKeys.length === 0) {
        log.warn({ characterId: character.id }, 'Character has no reference images â€” generating text-to-video');
        imageBuffers.push(null);
      } else {
        const url = await getPresignedUrl(refKeys[0], 600);
        const res = await fetch(url);
        if (!res.ok) {
          log.warn({ characterId: character.id, refKey: refKeys[0], status: res.status }, 'Failed to download reference image');
          imageBuffers.push(null);
        } else {
          const buf = Buffer.from(await res.arrayBuffer());
          imageBuffers.push({
            base64: buf.toString('base64'),
            mimeType: res.headers.get('content-type') ?? 'image/jpeg',
          });
        }
      }
    }

    const prompts = buildVideoPromptVariations(promptInputs);

    await prisma.generationJob.update({
      where: { id: generationJobId },
      data: { prompt: prompts[0] },
    });

    // Submit all videos to Veo in parallel.
    const submissions = await Promise.all(
      prompts.map((prompt, i) =>
        veo.submitGeneration({
          prompt,
          imageBase64: imageBuffers[i]?.base64,
          imageMimeType: imageBuffers[i]?.mimeType,
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
 *   - prefs.videos: [{ characterId, script }, ...]   (new format)
 *   - prefs.characterId + prefs.customMessage         (legacy fallback, single script repeated)
 */
async function resolveVideoSpecs(
  prefs: Record<string, unknown>,
  expectedCount: number,
): Promise<VideoSpec[]> {
  const rawVideos = prefs.videos;
  if (Array.isArray(rawVideos) && rawVideos.length > 0) {
    const specs: VideoSpec[] = [];
    for (const v of rawVideos) {
      if (
        v &&
        typeof v === 'object' &&
        typeof (v as VideoSpec).characterId === 'string' &&
        typeof (v as VideoSpec).script === 'string' &&
        (v as VideoSpec).script.trim().length > 0
      ) {
        specs.push({
          characterId: (v as VideoSpec).characterId,
          script: (v as VideoSpec).script,
        });
      }
    }
    if (specs.length > 0) return specs;
  }

  // Legacy fallback: single character + customMessage repeated for the package count.
  const characterId = typeof prefs.characterId === 'string' ? prefs.characterId : null;
  const script = typeof prefs.customMessage === 'string' ? prefs.customMessage : null;

  if (!characterId || !script || script.trim().length === 0) return [];

  return Array.from({ length: expectedCount }, () => ({ characterId, script }));
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
