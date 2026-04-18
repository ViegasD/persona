import { env } from './shared/config/env.js';
import { logger } from './shared/utils/logger.js';
import { connectDatabase, disconnectDatabase } from './shared/database/prisma.js';
import { closeRedis } from './shared/queue/queue.config.js';
import { closeQueues } from './shared/queue/queues.js';
import { closeEventBus } from './shared/queue/event-bus.js';
import { buildApp } from './app.js';
import { startWorkers, stopWorkers } from './workers.js';

async function main() {
  logger.info('Iniciando Persona Backend...');

  await connectDatabase();

  const app = await buildApp();

  startWorkers();

  await app.listen({ port: env.PORT, host: env.HOST });
  logger.info({ port: env.PORT }, 'Servidor rodando');

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Desligando...');
    await app.close();
    await stopWorkers();
    await closeQueues();
    await closeEventBus();
    await closeRedis();
    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal(err, 'Falha ao iniciar');
  process.exit(1);
});
