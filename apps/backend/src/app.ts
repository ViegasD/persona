import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { env } from './shared/config/env.js';
import { errorHandler } from './shared/middleware/error-handler.js';
import { createChildLogger } from './shared/utils/logger.js';

// Module routers
import { whatsappRouter } from './modules/whatsapp/whatsapp.router.js';
import { galleryRouter } from './modules/gallery/gallery.router.js';
import { paymentRouter } from './modules/payment/payment.router.js';
import { analyticsRouter } from './modules/analytics/analytics.router.js';
import { devRouter } from './modules/dev/dev.router.js';

const log = createChildLogger('app');

export async function buildApp() {
  const app = Fastify({
    logger: false, // Usando pino customizado
    trustProxy: true,
    bodyLimit: 10 * 1024 * 1024, // 10 MB — webhooks Evolution podem conter mídia base64
  });

  // ─── Plugins ─────────────────────────────────────────────
  await app.register(cors, {
    origin: [env.WEB_BASE_URL],
    credentials: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // ─── Error Handler ───────────────────────────────────────
  app.setErrorHandler(errorHandler);

  // ─── Health Check ────────────────────────────────────────
  app.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // ─── Module Routes ───────────────────────────────────────
  await app.register(whatsappRouter, { prefix: '/api/webhooks' });
  await app.register(paymentRouter, { prefix: '/api' });
  await app.register(galleryRouter, { prefix: '/api/gallery' });
  await app.register(analyticsRouter, { prefix: '/api/admin' });

  // Dev routes — only in development
  if (env.NODE_ENV === 'development') {
    await app.register(devRouter, { prefix: '/api/dev' });
  }

  log.info('App configurado');
  return app;
}
