import type { Job } from 'bullmq';
import type { VideoGenerationJobData } from '../../shared/queue/queues.js';
import { prisma } from '../../shared/database/prisma.js';
import { getPresignedUrl } from '../../shared/storage/s3.client.js';
import { env } from '../../shared/config/env.js';
import { getPackageById, PACKAGES } from '../funnel/packages.config.js';
import { createChildLogger } from '../../shared/utils/logger.js';
import { xaiVideo, XaiApiError } from './xai-video.client.js';
import { buildVideoPromptVariations } from './video-prompt.engine.js';
import { processGeneratedVideos } from './video-result.processor.js';
import { queueTextMessage, logOutboundMessage } from '../whatsapp/whatsapp.service.js';
import { trackEvent } from '../analytics/analytics.service.js';
import { MESSAGES } from '../funnel/messages.templates.js';
import { FUNNEL_STATES } from '../funnel/funnel.state-machine.v2.js';

const log = createChildLogger('video-gen-worker');
const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_ATTEMPTS = 120; // 10 minutes max

/**
 * Worker that processes video generation jobs via xAI Grok Imagine Video.
 * Flow: load character → build prompt → submit to xAI → poll → download → S3 → gallery
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

  // Verify payment
  const payment = await prisma.payment.findFirst({
    where: { leadSessionId, status: 'APPROVED' },
  });

  if (!payment) {
    log.error({ leadSessionId }, 'No approved payment found — aborting generation');
    throw new Error('Payment not found');
  }

  try {
    // Update status
    await prisma.generationJob.update({
      where: { id: generationJobId },
      data: { status: 'PROCESSING', startedAt: new Date() },
    });

    const prefs = session.preferences as Record<string, string>;
    const pkg = getPackageById(prefs.packageId) ?? PACKAGES[PACKAGES.length - 1];

    // Load character
    const characterId = prefs.characterId;
    if (!characterId) {
      throw new Error('No character selected in session preferences');
    }

    const character = await prisma.character.findUnique({
      where: { id: characterId },
    });

    if (!character) {
      throw new Error(`Character ${characterId} not found`);
    }

    // Get presigned URLs for character reference images
    const refKeys = character.referenceImageS3Keys as string[];
    if (refKeys.length === 0) {
      throw new Error(`Character ${character.name} has no reference images`);
    }

    const referenceUrls = await Promise.all(
      refKeys.map((key) => getPresignedUrl(key, 3600)),
    );

    log.info(
      { characterName: character.name, refCount: referenceUrls.length },
      'Character reference images loaded',
    );

    // Build prompt variations
    const videoCount = pkg.videos ?? 1;
    const prompts = buildVideoPromptVariations({
      characterName: character.name,
      characterPersonality: character.personality ?? undefined,
      messageType: prefs.messageType ?? 'default',
      recipientName: prefs.recipientName ?? '',
      recipientAge: prefs.recipientAge,
      customMessage: prefs.customMessage,
      referenceImageCount: referenceUrls.length,
    }, videoCount);

    // Save representative prompt
    await prisma.generationJob.update({
      where: { id: generationJobId },
      data: { prompt: prompts[0] },
    });

    // Submit to xAI — 1 request per video
    const taskPromises = prompts.map((prompt) =>
      xaiVideo.submitGeneration({
        prompt,
        referenceImageUrls: referenceUrls,
        duration: env.VIDEO_DURATION,
        aspectRatio: env.VIDEO_ASPECT_RATIO,
        resolution: env.VIDEO_RESOLUTION,
      }),
    );
    const xaiTasks = await Promise.all(taskPromises);
    const requestIds = xaiTasks.map((t) => t.requestId);

    await prisma.generationJob.update({
      where: { id: generationJobId },
      data: { externalJobId: requestIds.join(',') },
    });

    log.info({ requestIds, count: requestIds.length }, 'Tasks submitted to xAI');

    // Transition to GENERATING
    await prisma.leadSession.update({
      where: { id: leadSessionId },
      data: { funnelState: FUNNEL_STATES.GENERATING },
    });
    await prisma.lead.update({
      where: { id: session.leadId },
      data: { status: 'GENERATING' },
    });

    // Send progress message
    const progressMsg = MESSAGES.generationProgress();
    await queueTextMessage(session.lead.phone, progressMsg);
    await logOutboundMessage(session.leadId, progressMsg);

    // Poll all tasks
    const completedVideos = await pollVideoTasks(requestIds);

    // Auto-retry failed tasks (one round)
    const failedCount = videoCount - completedVideos.length;
    if (failedCount > 0 && completedVideos.length > 0) {
      log.warn({ expected: videoCount, got: completedVideos.length, retrying: failedCount }, 'Some tasks failed — retrying');
      const retryTasks = await Promise.all(
        Array.from({ length: failedCount }, (_, i) => {
          const originalIndex = completedVideos.length + i;
          return xaiVideo.submitGeneration({
            prompt: prompts[originalIndex % prompts.length],
            referenceImageUrls: referenceUrls,
            duration: env.VIDEO_DURATION,
            aspectRatio: env.VIDEO_ASPECT_RATIO,
            resolution: env.VIDEO_RESOLUTION,
          });
        }),
      );
      const retryIds = retryTasks.map((t) => t.requestId);
      log.info({ retryIds }, 'Retry tasks submitted to xAI');
      const retryResults = await pollVideoTasks(retryIds);
      completedVideos.push(...retryResults);
    }

    const totalFailed = videoCount - completedVideos.length;
    if (completedVideos.length === 0) {
      throw new Error('No videos returned by xAI');
    }

    if (totalFailed > 0) {
      log.warn({ expected: videoCount, delivered: completedVideos.length, failed: totalFailed }, 'Partial generation — some videos could not be generated');
    }

    // Process and store videos
    const videoIds = await processGeneratedVideos(
      completedVideos.map((v) => ({
        videoUrl: v.videoUrl!,
        durationSeconds: v.durationSeconds,
        aspectRatio: env.VIDEO_ASPECT_RATIO,
        resolution: env.VIDEO_RESOLUTION,
      })),
      generationJobId,
      leadSessionId,
    );

    // Update job status
    await prisma.generationJob.update({
      where: { id: generationJobId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    // Transition to GALLERY_SENT
    await prisma.leadSession.update({
      where: { id: leadSessionId },
      data: {
        funnelState: FUNNEL_STATES.GALLERY_SENT,
        metadata: {
          ...(session.metadata as Record<string, unknown>),
          expectedVideos: videoCount,
          deliveredVideos: completedVideos.length,
          failedVideos: totalFailed,
        },
      },
    });

    await prisma.lead.update({
      where: { id: session.leadId },
      data: { status: 'APPROVING' },
    });

    await trackEvent(session.leadId, 'VIDEOS_GENERATED', {
      count: completedVideos.length,
      expected: videoCount,
      failed: totalFailed,
      generationJobId,
    });

    // Notify client
    const doneMsg = MESSAGES.generationComplete?.() ?? '✅ Seus vídeos ficaram prontos! Em breve enviaremos para aprovação.';
    await queueTextMessage(session.lead.phone, doneMsg);
    await logOutboundMessage(session.leadId, doneMsg);

    log.info({ leadSessionId, videoCount: completedVideos.length, generationJobId }, 'Video generation completed');

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

    // Notify admin / track
    await trackEvent(session.leadId, 'VIDEO_GENERATION_FAILED', {
      generationJobId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
}

/**
 * Polls xAI video tasks until completion or timeout.
 */
async function pollVideoTasks(
  requestIds: string[],
): Promise<Array<{ requestId: string; videoUrl: string; durationSeconds?: number }>> {
  const completed: Array<{ requestId: string; videoUrl: string; durationSeconds?: number }> = [];
  const pending = new Set(requestIds);

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS && pending.size > 0; attempt++) {
    await sleep(POLL_INTERVAL_MS);

    for (const requestId of [...pending]) {
      try {
        const result = await xaiVideo.getStatus(requestId);

        if (result.status === 'done' && result.videoUrl) {
          completed.push({
            requestId,
            videoUrl: result.videoUrl,
            durationSeconds: result.durationSeconds,
          });
          pending.delete(requestId);
          log.debug({ requestId, attempt }, 'Video task completed');
        } else if (result.status === 'failed' || result.status === 'expired') {
          pending.delete(requestId);
          log.warn({ requestId, status: result.status, error: result.error }, 'Video task failed/expired');
        }
        // 'pending' → continue polling
      } catch (error) {
        log.error({ requestId, attempt, error }, 'Error polling xAI task');
        // Don't remove from pending — will retry on next attempt
      }
    }

    if (pending.size > 0) {
      log.debug({ pending: pending.size, completed: completed.length, attempt }, 'Video polling progress');
    }
  }

  if (pending.size > 0) {
    log.warn({ timedOut: [...pending] }, 'Some video tasks timed out');
  }

  return completed;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
