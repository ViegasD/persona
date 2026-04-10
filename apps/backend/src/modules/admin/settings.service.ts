import { prisma } from '../../shared/database/prisma.js';
import { env } from '../../shared/config/env.js';
import { createChildLogger } from '../../shared/utils/logger.js';

const log = createChildLogger('settings');

/** In-memory cache: key → { value, expiresAt } */
const cache = new Map<string, { value: string; expiresAt: number }>();
const CACHE_TTL_MS = 30_000; // 30 seconds

export const SETTING_KEYS = {
  MESSAGE_DEBOUNCE_MS: 'message_debounce_ms',
} as const;

const DEFAULTS: Record<string, string> = {
  [SETTING_KEYS.MESSAGE_DEBOUNCE_MS]: String(env.MESSAGE_DEBOUNCE_MS),
};

/**
 * Get a setting value (cached). Falls back to env/default if not in DB.
 */
export async function getSetting(key: string): Promise<string> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  try {
    const row = await prisma.setting.findUnique({ where: { key } });
    const value = row?.value ?? DEFAULTS[key] ?? '';
    cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  } catch (err) {
    log.warn({ err, key }, 'Failed to read setting from DB — using default');
    const fallback = DEFAULTS[key] ?? '';
    cache.set(key, { value: fallback, expiresAt: Date.now() + CACHE_TTL_MS });
    return fallback;
  }
}

/**
 * Get a numeric setting.
 */
export async function getSettingNumber(key: string): Promise<number> {
  const value = await getSetting(key);
  return Number(value) || 0;
}

/**
 * Update a setting and invalidate cache.
 */
export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  log.info({ key, value }, 'Setting updated');
}

/**
 * Get all settings (for admin display).
 */
export async function getAllSettings(): Promise<Record<string, string>> {
  try {
    const rows = await prisma.setting.findMany();
    const result: Record<string, string> = { ...DEFAULTS };
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  } catch (err) {
    log.warn({ err }, 'Failed to read settings from DB — returning defaults');
    return { ...DEFAULTS };
  }
}
