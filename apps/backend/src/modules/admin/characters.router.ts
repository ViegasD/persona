import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { verifyAdminAuth } from '../../shared/middleware/auth.js';
import { prisma } from '../../shared/database/prisma.js';
import { uploadFile, getPresignedUrl, deleteFile } from '../../shared/storage/s3.client.js';
import { createChildLogger } from '../../shared/utils/logger.js';

const log = createChildLogger('characters-router');

export async function charactersRouter(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', verifyAdminAuth);

  // ─── List Characters ───────────────────────────────────

  /** GET /api/admin/characters — list all characters */
  app.get('/characters', async (_req: FastifyRequest, reply: FastifyReply) => {
    const characters = await prisma.character.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });

    const result = characters.map((c) => {
        const refKeys = (c.referenceImageS3Keys as string[]) ?? [];
        const previewUrl = refKeys.length > 0
          ? `/api/images/${refKeys[0]}`
          : null;
        return {
          id: c.id,
          name: c.name,
          slug: c.slug,
          personality: c.personality,
          tags: c.tags,
          gender: c.gender,
          ageRange: c.ageRange,
          isActive: c.isActive,
          referenceImageCount: refKeys.length,
          previewUrl,
          createdAt: c.createdAt,
        };
    });

    reply.send(result);
  });

  // ─── Get Single Character ─────────────────────────────

  /** GET /api/admin/characters/:id — get character with presigned image URLs */
  app.get('/characters/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const character = await prisma.character.findUnique({ where: { id: req.params.id } });
    if (!character) return reply.status(404).send({ error: 'Personagem não encontrado' });

    const refKeys = (character.referenceImageS3Keys as string[]) ?? [];
    const referenceImages = await Promise.all(
      refKeys.map(async (key) => ({
        s3Key: key,
        url: await getPresignedUrl(key, 3600),
      })),
    );

    reply.send({
      ...character,
      referenceImages,
    });
  });

  // ─── Create Character ─────────────────────────────────

  /** POST /api/admin/characters — create a new character */
  app.post('/characters', async (req: FastifyRequest, reply: FastifyReply) => {
    const { name, slug, personality, tags, gender, ageRange } = req.body as {
      name: string;
      slug?: string;
      personality?: string;
      tags?: string[];
      gender?: string;
      ageRange?: string;
    };

    if (!name?.trim()) {
      return reply.status(400).send({ error: 'name is required' });
    }

    const sanitizedSlug = (slug || name).toLowerCase().trim().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');

    const existing = await prisma.character.findUnique({ where: { slug: sanitizedSlug } });
    if (existing) {
      return reply.status(409).send({ error: `Character slug "${sanitizedSlug}" already exists` });
    }

    const character = await prisma.character.create({
      data: {
        name: name.trim(),
        slug: sanitizedSlug,
        personality: personality?.trim() || null,
        tags: tags ?? [],
        gender: gender?.trim() || null,
        ageRange: ageRange?.trim() || null,
        referenceImageS3Keys: [],
      },
    });

    log.info({ id: character.id, name: character.name }, 'Character created');
    reply.status(201).send(character);
  });

  // ─── Update Character ─────────────────────────────────

  /** PUT /api/admin/characters/:id — update character metadata */
  app.put('/characters/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const character = await prisma.character.findUnique({ where: { id: req.params.id } });
    if (!character) return reply.status(404).send({ error: 'Personagem não encontrado' });

    const { name, personality, tags, gender, ageRange, isActive } = req.body as {
      name?: string;
      personality?: string;
      tags?: string[];
      gender?: string;
      ageRange?: string;
      isActive?: boolean;
    };

    const updated = await prisma.character.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(personality !== undefined ? { personality: personality.trim() || null } : {}),
        ...(tags !== undefined ? { tags } : {}),
        ...(gender !== undefined ? { gender: gender.trim() || null } : {}),
        ...(ageRange !== undefined ? { ageRange: ageRange.trim() || null } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
    });

    log.info({ id: updated.id }, 'Character updated');
    reply.send(updated);
  });

  // ─── Upload Reference Image ───────────────────────────

  /** POST /api/admin/characters/:id/images — upload reference image (base64) */
  app.post('/characters/:id/images', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const character = await prisma.character.findUnique({ where: { id: req.params.id } });
    if (!character) return reply.status(404).send({ error: 'Personagem não encontrado' });

    const { base64, filename, mimeType } = req.body as {
      base64: string;
      filename?: string;
      mimeType?: string;
    };

    if (!base64) return reply.status(400).send({ error: 'base64 is required' });

    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length === 0) return reply.status(400).send({ error: 'Empty image data' });

    const mime = mimeType ?? 'image/jpeg';
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const s3Key = `characters/${character.slug}/${filename ?? `${randomUUID()}.${ext}`}`;

    await uploadFile(s3Key, buffer, mime);

    const currentKeys = (character.referenceImageS3Keys as string[]) ?? [];
    const updatedKeys = [...currentKeys, s3Key];

    await prisma.character.update({
      where: { id: character.id },
      data: { referenceImageS3Keys: updatedKeys },
    });

    const url = await getPresignedUrl(s3Key, 3600);

    log.info({ characterId: character.id, s3Key }, 'Reference image uploaded');
    reply.status(201).send({ s3Key, url });
  });

  // ─── Delete Reference Image ───────────────────────────

  /** DELETE /api/admin/characters/:id/images — remove reference image */
  app.delete('/characters/:id/images', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const character = await prisma.character.findUnique({ where: { id: req.params.id } });
    if (!character) return reply.status(404).send({ error: 'Personagem não encontrado' });

    const { s3Key } = req.body as { s3Key: string };
    if (!s3Key) return reply.status(400).send({ error: 's3Key is required' });

    const currentKeys = (character.referenceImageS3Keys as string[]) ?? [];
    if (!currentKeys.includes(s3Key)) {
      return reply.status(404).send({ error: 'Image not found on this character' });
    }

    await deleteFile(s3Key);

    const updatedKeys = currentKeys.filter((k) => k !== s3Key);
    await prisma.character.update({
      where: { id: character.id },
      data: { referenceImageS3Keys: updatedKeys },
    });

    log.info({ characterId: character.id, s3Key }, 'Reference image deleted');
    reply.send({ success: true });
  });

  // ─── Delete Character ─────────────────────────────────

  /** DELETE /api/admin/characters/:id — soft-delete (deactivate) character */
  app.delete('/characters/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const character = await prisma.character.findUnique({ where: { id: req.params.id } });
    if (!character) return reply.status(404).send({ error: 'Personagem não encontrado' });

    await prisma.character.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });

    log.info({ id: character.id }, 'Character deactivated');
    reply.send({ success: true });
  });
}
