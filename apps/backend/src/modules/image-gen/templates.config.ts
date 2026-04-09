import { listObjects, getPresignedUrl } from '../../shared/storage/s3.client.js';
import { prisma } from '../../shared/database/prisma.js';
import { createChildLogger } from '../../shared/utils/logger.js';

const log = createChildLogger('templates-config');

/**
 * S3 prefix root for style template images.
 * Each occasion has its own subfolder: templates/aniversario/, templates/profissional/, etc.
 * Upload any number of images to a folder — one is picked randomly per generation task.
 */
const TEMPLATES_PREFIX = 'templates';

/**
 * Lists all S3 keys under templates/{occasion}/.
 * Supports unlimited templates — just upload to MinIO.
 */
export async function listTemplateKeys(occasion: string): Promise<string[]> {
  const prefix = `${TEMPLATES_PREFIX}/${occasion.toLowerCase()}`;
  try {
    const keys = await listObjects(prefix);
    return keys.filter((k) => /\.(jpg|jpeg|png|webp)$/i.test(k));
  } catch (err) {
    log.warn({ occasion, err }, '[TEMPLATES] Failed to list templates — will generate without style reference');
    return [];
  }
}

/**
 * Picks N unique random template presigned URLs for a given occasion.
 * If fewer templates exist than requested, repeats with shuffle.
 * Returns empty array if no templates uploaded for this occasion.
 */
export async function pickRandomStyleTemplates(
  occasion: string,
  count: number,
): Promise<string[]> {
  const keys = await listTemplateKeys(occasion);
  if (keys.length === 0) return [];

  // Shuffle keys and expand to cover `count` picks (with wrapping if needed)
  const shuffled = shuffle([...keys]);
  const picks: string[] = [];
  for (let i = 0; i < count; i++) {
    picks.push(shuffled[i % shuffled.length]);
  }

  // Resolve presigned URLs, silently drop any that fail
  const urls = await Promise.all(
    picks.map((key) =>
      getPresignedUrl(key, 3600).catch((err) => {
        log.warn({ key, err }, '[TEMPLATES] Failed to get presigned URL for template');
        return null;
      }),
    ),
  );

  return urls.filter((u): u is string => u !== null);
}

/**
 * Picks templates from DB, optionally matching by style description tags.
 * Falls back to pickRandomStyleTemplates (MinIO) if DB has no templates.
 */
export async function pickStyleTemplatesFromDb(
  occasion: string,
  count: number,
  styleDescription?: string,
): Promise<string[]> {
  try {
    const occ = await prisma.occasion.findFirst({
      where: { slug: occasion.toLowerCase(), isActive: true },
    });
    if (!occ) return pickRandomStyleTemplates(occasion, count);

    let templates: Array<{ s3Key: string; tags: string[] }>;

    if (styleDescription) {
      // Tag-based matching: extract words from user style description and match against DB tags
      const words = styleDescription
        .toLowerCase()
        .split(/[\s,;.]+/)
        .filter((w) => w.length > 2);

      templates = await prisma.styleTemplate.findMany({
        where: {
          occasionId: occ.id,
          isActive: true,
          tags: { hasSome: words },
        },
        select: { s3Key: true, tags: true },
      });

      // If tag matching found nothing, fall back to all templates for this occasion
      if (templates.length === 0) {
        templates = await prisma.styleTemplate.findMany({
          where: { occasionId: occ.id, isActive: true },
          select: { s3Key: true, tags: true },
        });
      }
    } else {
      templates = await prisma.styleTemplate.findMany({
        where: { occasionId: occ.id, isActive: true },
        select: { s3Key: true, tags: true },
      });
    }

    if (templates.length === 0) return pickRandomStyleTemplates(occasion, count);

    const shuffled = shuffle([...templates]);
    const picks = Array.from({ length: count }, (_, i) => shuffled[i % shuffled.length].s3Key);

    const urls = await Promise.all(
      picks.map((key) =>
        getPresignedUrl(key, 3600).catch((err) => {
          log.warn({ key, err }, '[TEMPLATES] Failed to get presigned URL for DB template');
          return null;
        }),
      ),
    );

    const valid = urls.filter((u): u is string => u !== null);
    return valid.length > 0 ? valid : pickRandomStyleTemplates(occasion, count);
  } catch (err) {
    log.warn({ occasion, err }, '[TEMPLATES] DB query failed — falling back to MinIO');
    return pickRandomStyleTemplates(occasion, count);
  }
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
