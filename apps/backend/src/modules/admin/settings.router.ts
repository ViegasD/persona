import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyAdminAuth } from '../../shared/middleware/auth.js';
import { getAllSettings, setSetting, SETTING_KEYS } from './settings.service.js';
import { createChildLogger } from '../../shared/utils/logger.js';

const log = createChildLogger('settings-router');

/** Allowed settings and their validation rules */
const SETTING_RULES: Record<string, { min: number; max: number; label: string }> = {
  [SETTING_KEYS.MESSAGE_DEBOUNCE_MS]: { min: 2000, max: 60000, label: 'Tempo de espera (ms)' },
};

export async function settingsRouter(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', verifyAdminAuth);

  // GET /api/admin/settings — list all settings
  app.get('/settings', async (_request: FastifyRequest, _reply: FastifyReply) => {
    const settings = await getAllSettings();
    return { settings };
  });

  // PUT /api/admin/settings — update one or more settings
  app.put('/settings', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown>;

    if (!body || typeof body !== 'object') {
      return reply.status(400).send({ error: 'Body must be a JSON object' });
    }

    const updates: Record<string, string> = {};
    const errors: string[] = [];

    for (const [key, value] of Object.entries(body)) {
      const rule = SETTING_RULES[key];
      if (!rule) {
        errors.push(`Unknown setting: ${key}`);
        continue;
      }

      const num = Number(value);
      if (isNaN(num) || num < rule.min || num > rule.max) {
        errors.push(`${rule.label}: must be between ${rule.min} and ${rule.max}`);
        continue;
      }

      updates[key] = String(Math.round(num));
    }

    if (errors.length > 0) {
      return reply.status(400).send({ error: errors.join('; ') });
    }

    for (const [key, value] of Object.entries(updates)) {
      await setSetting(key, value);
    }

    log.info({ updates }, 'Settings updated via admin');
    return { success: true, updated: updates };
  });
}
