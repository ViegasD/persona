import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { verifyAdminAuth } from '../../shared/middleware/auth.js';
import { prisma } from '../../shared/database/prisma.js';
import { uploadFile, getPresignedUrl, deleteFile, listObjects, getS3Object } from '../../shared/storage/s3.client.js';
import { analyzeTemplateImage } from '../image-gen/vision.service.js';
import { createChildLogger } from '../../shared/utils/logger.js';

const log = createChildLogger('templates-router');

export async function templatesRouter(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', verifyAdminAuth);

  // ─── Occasions CRUD ────────────────────────────────────

  /** GET /api/admin/occasions — list all occasions with template counts */
  app.get('/occasions', async (_req: FastifyRequest, reply: FastifyReply) => {
    const occasions = await prisma.occasion.findMany({
      where: { isActive: true },
      orderBy: { slug: 'asc' },
      include: { _count: { select: { templates: { where: { isActive: true } } } } },
    });

    reply.send(occasions.map((o) => ({
      id: o.id,
      slug: o.slug,
      label: o.label,
      promptHint: o.promptHint,
      templateCount: o._count.templates,
      createdAt: o.createdAt,
    })));
  });

  /** POST /api/admin/occasions — create a new occasion */
  app.post('/occasions', async (req: FastifyRequest, reply: FastifyReply) => {
    const { slug, label, promptHint } = req.body as { slug: string; label: string; promptHint?: string };

    if (!slug || !label) {
      return reply.status(400).send({ error: 'slug and label are required' });
    }

    const sanitizedSlug = slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '');

    const existing = await prisma.occasion.findUnique({ where: { slug: sanitizedSlug } });
    if (existing) {
      return reply.status(409).send({ error: `Occasion "${sanitizedSlug}" already exists` });
    }

    const occasion = await prisma.occasion.create({
      data: {
        slug: sanitizedSlug,
        label: label.trim(),
        promptHint: promptHint?.trim() ?? `${label} themed photography`,
      },
    });

    reply.status(201).send(occasion);
  });

  /** PUT /api/admin/occasions/:id — update occasion */
  app.put('/occasions/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { label, promptHint, isActive } = req.body as { label?: string; promptHint?: string; isActive?: boolean };

    const occasion = await prisma.occasion.update({
      where: { id: req.params.id },
      data: {
        ...(label !== undefined && { label: label.trim() }),
        ...(promptHint !== undefined && { promptHint: promptHint.trim() }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    reply.send(occasion);
  });

  /** DELETE /api/admin/occasions/:id — soft-delete */
  app.delete('/occasions/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    await prisma.occasion.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    reply.send({ success: true });
  });

  // ─── Templates CRUD ────────────────────────────────────

  /** GET /api/admin/occasions/:slug/templates — list templates for an occasion */
  app.get(
    '/occasions/:slug/templates',
    async (req: FastifyRequest<{ Params: { slug: string } }>, reply: FastifyReply) => {
      const occasion = await prisma.occasion.findUnique({ where: { slug: req.params.slug } });
      if (!occasion) return reply.status(404).send({ error: 'Occasion not found' });

      const templates = await prisma.styleTemplate.findMany({
        where: { occasionId: occasion.id, isActive: true },
        orderBy: { createdAt: 'desc' },
      });

      // Generate presigned URLs for each template image
      const data = await Promise.all(
        templates.map(async (t) => {
          let imageUrl: string | null = null;
          try {
            imageUrl = await getPresignedUrl(t.s3Key, 3600);
          } catch {
            log.warn({ s3Key: t.s3Key }, 'Failed to generate presigned URL for template');
          }
          return {
            id: t.id,
            s3Key: t.s3Key,
            scenePrompt: t.scenePrompt,
            tags: t.tags,
            gender: t.gender,
            imageUrl,
            createdAt: t.createdAt,
          };
        }),
      );

      reply.send({ occasion: { id: occasion.id, slug: occasion.slug, label: occasion.label }, templates: data });
    },
  );

  /**
   * POST /api/admin/occasions/:slug/templates — upload template image(s)
   * Body: { images: [{ base64: string, filename: string, mimeType: string }] }
   * Each image is stored in MinIO, analyzed by GPT-4o vision, and saved with scene prompt + tags.
   */
  app.post(
    '/occasions/:slug/templates',
    async (req: FastifyRequest<{ Params: { slug: string } }>, reply: FastifyReply) => {
      const occasion = await prisma.occasion.findUnique({ where: { slug: req.params.slug } });
      if (!occasion) return reply.status(404).send({ error: 'Occasion not found' });

      const { images } = req.body as {
        images: Array<{ base64: string; filename?: string; mimeType?: string }>;
      };

      if (!images || !Array.isArray(images) || images.length === 0) {
        return reply.status(400).send({ error: 'images array is required' });
      }

      const results: Array<{
        id: string;
        s3Key: string;
        scenePrompt: string;
        tags: string[];
        gender: string;
        imageUrl: string | null;
        createdAt: Date;
      }> = [];

      for (const img of images) {
        try {
          // Validate base64
          const buffer = Buffer.from(img.base64, 'base64');
          if (buffer.length === 0) {
            log.warn('Empty image buffer, skipping');
            continue;
          }

          const mime = img.mimeType ?? 'image/jpeg';
          const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
          const filename = img.filename ?? `${randomUUID()}.${ext}`;
          const s3Key = `templates/${occasion.slug}/${filename}`;

          // Upload to MinIO
          await uploadFile(s3Key, buffer, mime);

          // Save to DB immediately with pending prompt (fast response)
          const template = await prisma.styleTemplate.create({
            data: {
              occasionId: occasion.id,
              s3Key,
              scenePrompt: `[analyzing] ${occasion.label} scene...`,
              tags: [],
            },
          });

          results.push({
            id: template.id,
            s3Key: template.s3Key,
            scenePrompt: template.scenePrompt,
            tags: template.tags,
            gender: template.gender,
            imageUrl: await getPresignedUrl(s3Key, 3600),
            createdAt: template.createdAt,
          });

          // Fire-and-forget: run vision analysis in background, update DB when done
          const templateId = template.id;
          const occasionLabel = occasion.label;
          analyzeTemplateImage(img.base64, mime, occasionLabel)
            .then(async (analysis) => {
              await prisma.styleTemplate.update({
                where: { id: templateId },
                data: { scenePrompt: analysis.scenePrompt, tags: analysis.tags, gender: analysis.gender },
              });
              log.info({ templateId, s3Key, tagsCount: analysis.tags.length, gender: analysis.gender }, 'Vision analysis completed (background)');
            })
            .catch((err) => {
              prisma.styleTemplate.update({
                where: { id: templateId },
                data: { scenePrompt: `[pending] ${occasionLabel} scene — vision analysis failed` },
              }).catch(() => {});
              log.error({ err, templateId, s3Key }, 'Vision analysis failed (background)');
            });

          log.info({ templateId, s3Key }, 'Template created — vision running in background');
        } catch (err) {
          log.error({ err, filename: img.filename }, 'Failed to process template image');
        }
      }

      reply.status(201).send({ created: results.length, templates: results });
    },
  );

  /** PUT /api/admin/templates/:id — edit scene prompt / tags manually */
  app.put(
    '/templates/:id',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { scenePrompt, tags, gender } = req.body as { scenePrompt?: string; tags?: string[]; gender?: string };

      const validGenders = ['MALE', 'FEMALE', 'UNISEX'] as const;
      const genderUpdate = gender && validGenders.includes(gender as any)
        ? { gender: gender as (typeof validGenders)[number] }
        : {};

      const template = await prisma.styleTemplate.update({
        where: { id: req.params.id },
        data: {
          ...(scenePrompt !== undefined && { scenePrompt: scenePrompt.trim() }),
          ...(tags !== undefined && { tags: tags.map((t) => t.toLowerCase().trim()) }),
          ...genderUpdate,
        },
      });

      reply.send(template);
    },
  );

  /** DELETE /api/admin/templates/:id — soft-delete */
  app.delete(
    '/templates/:id',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      await prisma.styleTemplate.update({
        where: { id: req.params.id },
        data: { isActive: false },
      });
      reply.send({ success: true });
    },
  );

  /** GET /api/admin/template-image/:id — serve template image from S3 */
  app.get(
    '/template-image/:id',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      log.debug({ id: req.params.id }, 'template-image request');

      const template = await prisma.styleTemplate.findUnique({ where: { id: req.params.id } });
      if (!template) {
        log.warn({ id: req.params.id }, 'template-image: template not found');
        return reply.status(404).send({ error: 'Template not found' });
      }

      try {
        log.debug({ s3Key: template.s3Key }, 'template-image: fetching from S3');
        const obj = await getS3Object(template.s3Key);
        const bodyBytes = await obj.Body!.transformToByteArray();
        log.debug({ s3Key: template.s3Key, bytes: bodyBytes.length, contentType: obj.ContentType }, 'template-image: serving');
        reply
          .header('Content-Type', obj.ContentType ?? 'image/jpeg')
          .header('Cache-Control', 'public, max-age=86400')
          .send(Buffer.from(bodyBytes));
      } catch (err) {
        log.error({ err, s3Key: template.s3Key }, 'Failed to serve template image from S3');
        return reply.status(502).send({ error: 'Failed to load image from storage' });
      }
    },
  );

  /** POST /api/admin/templates/:id/regenerate-prompt — re-run vision analysis */
  app.post(
    '/templates/:id/regenerate-prompt',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const template = await prisma.styleTemplate.findUnique({
        where: { id: req.params.id },
        include: { occasion: true },
      });
      if (!template) return reply.status(404).send({ error: 'Template not found' });

      const obj = await getS3Object(template.s3Key);
      const bodyBytes = await obj.Body!.transformToByteArray();
      const base64 = Buffer.from(bodyBytes).toString('base64');
      const mime = obj.ContentType ?? 'image/jpeg';

      const analysis = await analyzeTemplateImage(base64, mime, template.occasion.label);

      const updated = await prisma.styleTemplate.update({
        where: { id: req.params.id },
        data: { scenePrompt: analysis.scenePrompt, tags: analysis.tags, gender: analysis.gender },
      });

      reply.send(updated);
    },
  );

  /**
   * POST /api/admin/sync-templates — one-time sync of existing MinIO templates into DB.
   * Scans templates/{slug}/ folders in MinIO and creates DB entries for any images
   * not yet tracked, with GPT-4o vision analysis.
   */
  app.post('/sync-templates', async (_req: FastifyRequest, reply: FastifyReply) => {
    const occasions = await prisma.occasion.findMany({ where: { isActive: true } });
    let totalSynced = 0;

    for (const occasion of occasions) {
      const prefix = `templates/${occasion.slug}`;
      let keys: string[];
      try {
        keys = await listObjects(prefix);
        keys = keys.filter((k) => /\.(jpg|jpeg|png|webp)$/i.test(k));
      } catch {
        log.warn({ slug: occasion.slug }, 'Failed to list MinIO objects for occasion');
        continue;
      }

      // Find already-tracked keys
      const existing = await prisma.styleTemplate.findMany({
        where: { occasionId: occasion.id },
        select: { s3Key: true },
      });
      const existingKeys = new Set(existing.map((e) => e.s3Key));

      const newKeys = keys.filter((k) => !existingKeys.has(k));
      if (newKeys.length === 0) continue;

      for (const s3Key of newKeys) {
        try {
          const obj = await getS3Object(s3Key);
          const bodyBytes = await obj.Body!.transformToByteArray();
          const base64 = Buffer.from(bodyBytes).toString('base64');
          const mime = obj.ContentType ?? 'image/jpeg';

          const analysis = await analyzeTemplateImage(base64, mime, occasion.label);

          await prisma.styleTemplate.create({
            data: {
              occasionId: occasion.id,
              s3Key,
              scenePrompt: analysis.scenePrompt,
              tags: analysis.tags,
              gender: analysis.gender,
            },
          });

          totalSynced++;
          log.info({ s3Key, occasion: occasion.slug }, 'Synced template from MinIO');
        } catch (err) {
          log.error({ err, s3Key }, 'Failed to sync template');
        }
      }
    }

    reply.send({ success: true, synced: totalSynced });
  });

  /**
   * POST /api/admin/seed-occasions — seeds the default occasions from config.
   * Safe to call multiple times — skips existing slugs.
   */
  app.post('/seed-occasions', async (_req: FastifyRequest, reply: FastifyReply) => {
    const SEED_OCCASIONS = [
      { slug: 'aniversario', label: 'Aniversário', promptHint: 'birthday celebration, party decorations, balloons, birthday cake' },
      { slug: 'profissional', label: 'Profissional', promptHint: 'professional corporate headshot, business attire, clean background' },
      { slug: 'formatura', label: 'Formatura', promptHint: 'graduation ceremony, academic cap and gown, diploma' },
      { slug: 'casal', label: 'Casal', promptHint: 'romantic couple portrait, warm intimate mood, soft lighting' },
      { slug: 'gravidez', label: 'Gravidez', promptHint: 'maternity photography, gentle pose, flowing dress, baby bump' },
      { slug: 'casual', label: 'Casual', promptHint: 'casual lifestyle photography, relaxed pose, natural setting' },
      { slug: 'familia', label: 'Família', promptHint: 'family portrait, warm colors, joyful expressions, group photo' },
      { slug: 'infantil', label: 'Infantil', promptHint: 'children photography, playful, colorful, fun setting' },
      { slug: 'fitness', label: 'Fitness', promptHint: 'fitness photography, athletic pose, gym or outdoor workout setting' },
      { slug: 'natalino', label: 'Natal', promptHint: 'Christmas themed portrait, festive decorations, red and green colors' },
      { slug: 'debutante', label: 'Debutante', promptHint: 'quinceañera / debutante ball, elegant dress, glamorous setting' },
      { slug: 'pet', label: 'Com Pet', promptHint: 'portrait with pet, pet and owner, heartwarming' },
    ];

    let created = 0;
    for (const occ of SEED_OCCASIONS) {
      const exists = await prisma.occasion.findUnique({ where: { slug: occ.slug } });
      if (!exists) {
        await prisma.occasion.create({ data: occ });
        created++;
      }
    }

    reply.send({ success: true, created, total: SEED_OCCASIONS.length });
  });
}
