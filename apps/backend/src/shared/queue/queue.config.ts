import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('redis');

let connection: Redis | null = null;

export function getRedisConnection(): Redis {
  if (!connection) {
    connection = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null, // Required by BullMQ
    });

    connection.on('connect', () => log.info('Conectado ao Redis'));
    connection.on('error', (err: unknown) => log.error(err, 'Erro Redis'));
  }
  return connection;
}

export async function closeRedis(): Promise<void> {
  if (connection) {
    await connection.quit();
    connection = null;
    log.info('Desconectado do Redis');
  }
}
