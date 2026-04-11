import { prisma } from '../../shared/database/prisma.js';
import { env } from '../../shared/config/env.js';
import { createChildLogger } from '../../shared/utils/logger.js';

const log = createChildLogger('settings');

/** In-memory cache: key → { value, expiresAt } */
const cache = new Map<string, { value: string; expiresAt: number }>();
const CACHE_TTL_MS = 30_000; // 30 seconds

export const SETTING_KEYS = {
  MESSAGE_DEBOUNCE_MS: 'message_debounce_ms',
  PORTFOLIO_URL: 'portfolio_url',
  STALE_FOLLOWUP_DELAY_MS: 'stale_followup_delay_ms',
  MODEL_AGENT_ENGAGEMENT: 'model_agent_engagement',
  MODEL_AGENT_PHOTO_COLLECTION: 'model_agent_photo_collection',
  MODEL_AGENT_STYLE_COLLECTION: 'model_agent_style_collection',
  MODEL_AGENT_UPSELL: 'model_agent_upsell',
  MODEL_AGENT_CONFIRMATION: 'model_agent_confirmation',
  MODEL_AGENT_PAYMENT: 'model_agent_payment',
  MODEL_AGENT_SUPPORT: 'model_agent_support',
  MODEL_AGENT_REENGAGEMENT: 'model_agent_reengagement',
} as const;

const DEFAULTS: Record<string, string> = {
  [SETTING_KEYS.MESSAGE_DEBOUNCE_MS]: String(env.MESSAGE_DEBOUNCE_MS),
  [SETTING_KEYS.PORTFOLIO_URL]: '',
  [SETTING_KEYS.STALE_FOLLOWUP_DELAY_MS]: '300000',
  [SETTING_KEYS.MODEL_AGENT_ENGAGEMENT]: env.OPENAI_MODEL,
  [SETTING_KEYS.MODEL_AGENT_PHOTO_COLLECTION]: env.OPENAI_MODEL,
  [SETTING_KEYS.MODEL_AGENT_STYLE_COLLECTION]: env.OPENAI_MODEL,
  [SETTING_KEYS.MODEL_AGENT_UPSELL]: env.OPENAI_MODEL,
  [SETTING_KEYS.MODEL_AGENT_CONFIRMATION]: env.OPENAI_MODEL,
  [SETTING_KEYS.MODEL_AGENT_PAYMENT]: env.OPENAI_MODEL,
  [SETTING_KEYS.MODEL_AGENT_SUPPORT]: env.OPENAI_MODEL,
  [SETTING_KEYS.MODEL_AGENT_REENGAGEMENT]: env.OPENAI_MODEL,
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

/**
 * Get the configured OpenAI model for a specific agent.
 * Falls back to env.OPENAI_MODEL if the agent name is unknown.
 */
export async function getAgentModel(agentName: string): Promise<string> {
  const keyMap: Record<string, string> = {
    engagement: SETTING_KEYS.MODEL_AGENT_ENGAGEMENT,
    'photo-collection': SETTING_KEYS.MODEL_AGENT_PHOTO_COLLECTION,
    'style-collection': SETTING_KEYS.MODEL_AGENT_STYLE_COLLECTION,
    upsell: SETTING_KEYS.MODEL_AGENT_UPSELL,
    confirmation: SETTING_KEYS.MODEL_AGENT_CONFIRMATION,
    payment: SETTING_KEYS.MODEL_AGENT_PAYMENT,
    support: SETTING_KEYS.MODEL_AGENT_SUPPORT,
    reengagement: SETTING_KEYS.MODEL_AGENT_REENGAGEMENT,
  };
  const key = keyMap[agentName];
  if (!key) return env.OPENAI_MODEL;
  return getSetting(key);
}
