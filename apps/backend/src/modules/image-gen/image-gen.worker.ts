import type { Job } from 'bullmq';
import type { ImageGenerationJobData } from '../../shared/queue/queues.js';
import { prisma } from '../../shared/database/prisma.js';
import { getPresignedUrl } from '../../shared/storage/s3.client.js';
import { env } from '../../shared/config/env.js';
import { getPackageById, PACKAGES } from '../funnel/packages.config.js';
import { createChildLogger } from '../../shared/utils/logger.js';
import { kieApi } from './kie-ai.client.js';
import { buildPrompt } from './prompt.engine.js';
import { processGeneratedImages } from './result.processor.js';
import { queueTextMessage } from '../whatsapp/whatsapp.service.js';
import { trackEvent } from '../analytics/analytics.service.js';
import { MESSAGES } from '../funnel/messages.templates.js';
import { FUNNEL_STATES } from '../funnel/funnel.state-machine.js';

const log = createChildLogger('image-gen-worker');
const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_ATTEMPTS = 120; // 10 minutos máximo

/**
 * Worker que processa jobs de geração de imagens.
 * Fluxo: gerar prompt → enviar para Kie.ai → poll até completo → baixar → S3 → galeria
 */
export async function processImageGeneration(
  job: Job<ImageGenerationJobData>,
): Promise<void> {
  const { leadSessionId, generationJobId } = job.data;

  log.info({ leadSessionId, generationJobId, jobId: job.id }, 'Iniciando geração de imagens');

  const session = await prisma.leadSession.findUnique({
    where: { id: leadSessionId },
    include: { lead: true, referenceImages: true },
  });

  if (!session) {
    log.error({ leadSessionId }, 'Sessão não encontrada');
    throw new Error('Sessão não encontrada');
  }

  // Verificar se pagamento está aprovado (safety check)
  const payment = await prisma.payment.findFirst({
    where: { leadSessionId, status: 'APPROVED' },
  });

  if (!payment) {
    log.error({ leadSessionId }, 'Nenhum pagamento aprovado encontrado — abortando geração');
    throw new Error('Pagamento não encontrado');
  }

  try {
    // Atualizar status
    await prisma.generationJob.update({
      where: { id: generationJobId },
      data: { status: 'PROCESSING', startedAt: new Date() },
    });

    // Montar prompt
    const prefs = session.preferences as Record<string, string>;
    const pkg = getPackageById(prefs.packageId) ?? PACKAGES[PACKAGES.length - 1];
    const { prompt, negativePrompt } = buildPrompt({
      occasion: prefs.occasion ?? 'casual',
      occasionDetails: prefs.occasionDetails,
    });

    // Atualizar prompt no job
    await prisma.generationJob.update({
      where: { id: generationJobId },
      data: { prompt },
    });

    // Obter URLs pré-assinadas das referências
    const referenceUrls = await Promise.all(
      session.referenceImages.map((ref) => getPresignedUrl(ref.s3Key, 3600)),
    );

    // Enviar para Kie.ai — 1 task por imagem (Nano Banana 2 gera 1 por chamada)
    const taskPromises = Array.from({ length: pkg.photos }, () =>
      kieApi.submitGeneration({
        prompt,
        referenceImages: referenceUrls,
      }),
    );
    const kieTasks = await Promise.all(taskPromises);
    const taskIds = kieTasks.map((t) => t.taskId);

    await prisma.generationJob.update({
      where: { id: generationJobId },
      data: { kieJobId: taskIds.join(',') },
    });

    log.info({ taskIds, count: taskIds.length }, 'Tasks enviadas ao Kie.ai');

    // Só agora transicionar para GENERATING (tasks confirmadas no Kie.ai)
    await prisma.leadSession.update({
      where: { id: leadSessionId },
      data: { funnelState: FUNNEL_STATES.GENERATING },
    });
    await prisma.lead.update({
      where: { id: session.leadId },
      data: { status: 'GENERATING' },
    });

    // Enviar mensagem de progresso
    await queueTextMessage(session.lead.phone, MESSAGES.generationProgress());

    // Polling de todas as tasks até completarem
    let attempts = 0;
    const completedUrls: string[] = [];
    const pendingTasks = new Set(taskIds);

    while (pendingTasks.size > 0) {
      if (attempts >= MAX_POLL_ATTEMPTS) {
        throw new Error(`Timeout aguardando geração (${pendingTasks.size} tasks pendentes)`);
      }

      await sleep(POLL_INTERVAL_MS);
      attempts++;

      for (const taskId of [...pendingTasks]) {
        const status = await kieApi.getTaskStatus(taskId);

        if (status.state === 'success') {
          completedUrls.push(...status.imageUrls);
          pendingTasks.delete(taskId);
        } else if (status.state === 'fail') {
          log.error({ taskId, error: status.error }, 'Kie.ai task falhou');
          pendingTasks.delete(taskId);
        }
      }

      if (attempts % 12 === 0) {
        log.debug({ attempts, pending: pendingTasks.size, completed: completedUrls.length }, 'Polling...');
      }
    }

    const imageUrls = completedUrls;

    if (imageUrls.length === 0) {
      throw new Error('Nenhuma imagem retornada pelo Kie.ai');
    }

    const imageIds = await processGeneratedImages(imageUrls, generationJobId, leadSessionId);

    // Atualizar status
    await prisma.generationJob.update({
      where: { id: generationJobId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    await prisma.leadSession.update({
      where: { id: leadSessionId },
      data: { funnelState: FUNNEL_STATES.GALLERY_SENT },
    });

    await prisma.lead.update({
      where: { id: session.leadId },
      data: { status: 'APPROVING' },
    });

    await queueTextMessage(session.lead.phone, MESSAGES.generationComplete());

    await trackEvent(session.leadId, 'IMAGES_GENERATED', {
      count: imageIds.length,
      generationJobId,
    });

    log.info({ leadSessionId, imageCount: imageIds.length }, 'Geração concluída com sucesso');
  } catch (error) {
    log.error({ generationJobId, error }, 'Falha na geração');

    await prisma.generationJob.update({
      where: { id: generationJobId },
      data: {
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date(),
      },
    });

    // Reverter estado para PAID para permitir nova tentativa
    await prisma.leadSession.update({
      where: { id: leadSessionId },
      data: { funnelState: FUNNEL_STATES.PAID },
    }).catch(() => {});
    await prisma.lead.update({
      where: { id: session.leadId },
      data: { status: 'PAID' },
    }).catch(() => {});

    await queueTextMessage(session.lead.phone, MESSAGES.errorOccurred());
    throw error; // BullMQ fará retry
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
