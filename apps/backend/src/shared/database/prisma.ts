import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import { env } from '../config/env.js';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('database');

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export async function connectDatabase(): Promise<void> {
  try {
    log.info('Aplicando migrations...');
    execSync('pnpm --filter @ensaio/backend prisma:deploy', {
      stdio: 'inherit',
      cwd: process.env.APP_ROOT || '/app',
      env: { ...process.env, DATABASE_URL: env.DATABASE_URL },
    });
    log.info('Migrations aplicadas');

    await prisma.$connect();
    log.info('Conectado ao PostgreSQL');
  } catch (error) {
    log.fatal(error, 'Falha ao conectar ao PostgreSQL');
    process.exit(1);
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  log.info('Desconectado do PostgreSQL');
}
