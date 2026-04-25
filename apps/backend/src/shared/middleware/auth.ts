import type { FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../config/env.js';
import { createAppError } from './error-handler.js';

/**
 * Middleware para validar webhook da Evolution API.
 * Verifica o header de autenticação configurado.
 */
export async function verifyEvolutionWebhook(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  if (!env.EVOLUTION_WEBHOOK_SECRET) return; // Skip se não configurado

  const authHeader = request.headers['authorization'];
  if (authHeader !== `Bearer ${env.EVOLUTION_WEBHOOK_SECRET}`) {
    throw createAppError(401, 'Webhook não autorizado', 'INVALID_WEBHOOK_AUTH');
  }
}

/**
 * Middleware para validar admin API key.
 */
export async function verifyAdminAuth(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const apiKey = request.headers['x-api-key'];
  // Use dedicated ADMIN_API_KEY if set, otherwise fall back to EVOLUTION_API_KEY
  const expectedKey = env.ADMIN_API_KEY ?? env.EVOLUTION_API_KEY;
  if (!apiKey || apiKey !== expectedKey) {
    throw createAppError(401, 'Não autorizado', 'UNAUTHORIZED');
  }
}
