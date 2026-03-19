import type { FastifyReply, FastifyRequest } from 'fastify';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('error-handler');

export interface AppError {
  statusCode: number;
  message: string;
  code?: string;
}

export function createAppError(statusCode: number, message: string, code?: string): AppError {
  return { statusCode, message, code };
}

export async function errorHandler(
  error: Error & Partial<AppError>,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const statusCode = error.statusCode ?? 500;
  const message = statusCode >= 500 ? 'Erro interno do servidor' : error.message;

  if (statusCode >= 500) {
    log.error({ err: error, url: request.url, method: request.method }, 'Erro interno');
  } else {
    log.warn({ statusCode, message, url: request.url }, 'Erro de requisição');
  }

  reply.status(statusCode).send({
    error: true,
    message,
    code: error.code,
  });
}
