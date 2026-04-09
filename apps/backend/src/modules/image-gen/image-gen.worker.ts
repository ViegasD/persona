import type { Job } from 'bullmq';
import { UnrecoverableError } from 'bullmq';
import type { ImageGenerationJobData } from '../../shared/queue/queues.js';
import { prisma } from '../../shared/database/prisma.js';
import { getPresignedUrl } from '../../shared/storage/s3.client.js';
import { env } from '../../shared/config/env.js';
import { getPackageById, PACKAGES } from '../funnel/packages.config.js';
import { createChildLogger } from '../../shared/utils/logger.js';
import { kieApi, KieApiError } from './kie-ai.client.js';
import { buildPromptVariations } from './prompt.engine.js';
import { pickRandomStyleTemplates, pickStyleTemplatesFromDb } from './templates.config.js';
import { processGeneratedImages } from './result.processor.js';
import { queueTextMessage } from '../whatsapp/whatsapp.service.js';
import { trackEvent } from '../analytics/analytics.service.js';
import { MESSAGES } from '../funnel/messages.templates.js';
import { FUNNEL_STATES } from '../funnel/funnel.state-machine.js';const log = createChildLogger('image-gen-worker');
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
    const occasion = prefs.occasion ?? 'casual';
    const isCoupleShot = occasion === 'casal';

    // Separar fotos de rosto (face) e referências de estilo (style) do usuário
    const faceRefs = session.referenceImages.filter((r) => (r as any).type !== 'style');
    const userStyleRefs = session.referenceImages.filter((r) => (r as any).type === 'style');

    // Se o usuário enviou style refs, usá-las; senão, fallback para templates do MinIO
    let styleTemplateUrls: string[];
    if (userStyleRefs.length > 0) {
      const allStyleUrls = await Promise.all(
        userStyleRefs.map((ref) => getPresignedUrl(ref.s3Key, 3600)),
      );
      // Shuffle and pick one per image (consistent with MinIO template behavior)
      const shuffled = [...allStyleUrls].sort(() => Math.random() - 0.5);
      styleTemplateUrls = Array.from({ length: pkg.photos }, (_, i) => shuffled[i % shuffled.length]);
      log.info({ userStyleRefCount: userStyleRefs.length, pickedCount: styleTemplateUrls.length }, 'Usando style refs do usuário');
    } else {
      // Buscar style templates do S3 (uma vez por job)
      const styleDesc = (prefs.styleDescription as string) ?? undefined;
      styleTemplateUrls = await pickStyleTemplatesFromDb(occasion, pkg.photos, styleDesc);
      log.info({ templateCount: styleTemplateUrls.length, fromDb: true }, 'Usando style templates (DB → MinIO fallback)');
    }
    const hasStyleTemplate = styleTemplateUrls.length > 0;

    // Gerar uma variação de prompt por imagem — cada imagem do batch tem pose distinta
    const prompts = await buildPromptVariations({
      occasion,
      occasionDetails: prefs.occasionDetails,
      ageAtBirthday: prefs.ageAtBirthday,
      profession: prefs.profession,
      graduationCourse: prefs.graduationCourse,
      hasStyleTemplate,
      isCoupleShot,
    }, pkg.photos);

    // Salvar prompt representativo (primeiro) no job
    await prisma.generationJob.update({
      where: { id: generationJobId },
      data: { prompt: prompts[0] },
    });

    // Obter URLs pré-assinadas das referências de rosto
    const referenceUrls = await Promise.all(
      faceRefs.map((ref) => getPresignedUrl(ref.s3Key, 3600)),
    );

    log.info(
      { refCount: referenceUrls.length, urls: referenceUrls.map(u => u.substring(0, 80) + '...') },
      'Reference image URLs para Kie.ai',
    );

    // Enviar para Kie.ai — 1 task por imagem (Nano Banana 2 gera 1 por chamada)
    // Cada task recebe referências + template de estilo + prompt com pose única
    const taskPromises = Array.from({ length: pkg.photos }, (_, i) => {
      const styleUrl = styleTemplateUrls[i];
      const imagesForTask = styleUrl ? [...referenceUrls, styleUrl] : referenceUrls;
      return kieApi.submitGeneration({
        prompt: prompts[i],
        referenceImages: imagesForTask,
      });
    });
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
    const completedUrls = await pollTasks(taskIds);

    // ── Auto-retry failed tasks (one round) ──
    const failedCount = pkg.photos - completedUrls.length;
    if (failedCount > 0 && completedUrls.length > 0) {
      log.warn({ expected: pkg.photos, got: completedUrls.length, retrying: failedCount }, 'Algumas tasks falharam — retentando');
      const retryTasks = await Promise.all(
        Array.from({ length: failedCount }, (_, i) => {
          const originalIndex = completedUrls.length + i;
          const styleUrl = styleTemplateUrls[originalIndex];
          const imagesForTask = styleUrl ? [...referenceUrls, styleUrl] : referenceUrls;
          return kieApi.submitGeneration({ prompt: prompts[originalIndex % prompts.length], referenceImages: imagesForTask });
        }),
      );
      const retryIds = retryTasks.map((t) => t.taskId);
      log.info({ retryIds }, 'Retry tasks enviadas ao Kie.ai');
      const retryUrls = await pollTasks(retryIds);
      completedUrls.push(...retryUrls);
    }

    const totalFailed = pkg.photos - completedUrls.length;
    if (completedUrls.length === 0) {
      throw new Error('Nenhuma imagem retornada pelo Kie.ai');
    }

    if (totalFailed > 0) {
      log.warn({ expected: pkg.photos, delivered: completedUrls.length, failed: totalFailed }, 'Geração parcial — algumas imagens não puderam ser geradas');
    }

    const imageIds = await processGeneratedImages(completedUrls, generationJobId, leadSessionId);

    // Atualizar status
    await prisma.generationJob.update({
      where: { id: generationJobId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    // Store expected count in session metadata so admin panel can show "X of Y"
    const currentMeta = (session.metadata ?? {}) as Record<string, unknown>;
    await prisma.leadSession.update({
      where: { id: leadSessionId },
      data: {
        funnelState: FUNNEL_STATES.GALLERY_SENT,
        metadata: {
          ...currentMeta,
          expectedPhotos: pkg.photos,
          deliveredPhotos: imageIds.length,
          failedPhotos: totalFailed,
        },
      },
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
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    log.error({ generationJobId, error }, 'Falha na geração');

    await prisma.generationJob.update({
      where: { id: generationJobId },
      data: {
        status: 'FAILED',
        errorMessage: errMsg,
        completedAt: new Date(),
      },
    });

    // Reverter estado para PAID — lead fica em espera, admin pode re-disparar geração
    await prisma.leadSession.update({
      where: { id: leadSessionId },
      data: { funnelState: FUNNEL_STATES.PAID },
    }).catch(() => {});
    await prisma.lead.update({
      where: { id: session.leadId },
      data: { status: 'PAID' },
    }).catch(() => {});

    // NUNCA avisar o cliente sobre problemas internos de geração.
    // O admin vê o job com status FAILED e pode re-disparar pelo painel.

    // Para erros de créditos insuficientes (402), parar retries imediatamente —
    // não adianta tentar de novo sem recarregar créditos.
    if (error instanceof KieApiError && error.code === 402) {
      log.warn({ generationJobId }, '[KIE] Créditos insuficientes — job marcado sem retry, admin deve recarregar e re-disparar');
      throw new UnrecoverableError(errMsg);
    }

    throw error; // Para outros erros, BullMQ pode tentar novamente
  }
}

/**
 * Polls a set of Kie.ai tasks until all complete or fail.
 * Returns image URLs from successful tasks only.
 */
async function pollTasks(taskIds: string[]): Promise<string[]> {
  let attempts = 0;
  const completedUrls: string[] = [];
  const pendingTasks = new Set(taskIds);

  while (pendingTasks.size > 0) {
    if (attempts >= MAX_POLL_ATTEMPTS) {
      log.warn({ pending: pendingTasks.size }, 'Polling timeout — treating remaining as failed');
      break;
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

  return completedUrls;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
