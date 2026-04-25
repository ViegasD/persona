import { z } from 'zod';
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load from app-level .env first, then override with monorepo root .env
// (root .env has the authoritative values for shared secrets)
config({ path: resolve(__dirname, '..', '..', '..', '.env') });
config({ path: resolve(__dirname, '..', '..', '..', '..', '..', '.env'), override: true });

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  API_BASE_URL: z.string().url(),
  WEB_BASE_URL: z.string().url(),

  // Database
  DATABASE_URL: z.string(),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Evolution API (WhatsApp)
  EVOLUTION_API_URL: z.string().url(),
  EVOLUTION_API_KEY: z.string(),
  EVOLUTION_INSTANCE_NAME: z.string(),
  EVOLUTION_WEBHOOK_SECRET: z.string().optional(),

  // Mercado Pago
  MERCADOPAGO_ACCESS_TOKEN: z.string(),
  MERCADOPAGO_WEBHOOK_SECRET: z.string().optional(),

  // OpenAI
  OPENAI_API_KEY: z.string(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_VISION_MODEL: z.string().default('gpt-4o'),

  // Kie.ai (legacy — image generation)
  KIE_API_URL: z.string().url().optional(),
  KIE_API_KEY: z.string().optional(),

  // Google Veo (video generation)
  GOOGLE_API_KEY: z.string().optional(),
  GOOGLE_API_URL: z.string().url().default('https://generativelanguage.googleapis.com/v1beta'),
  VEO_MODEL: z.string().default('veo-3.1-generate-preview'),
  NANO_BANANA_MODEL: z.string().default('gemini-2.5-flash-image'),
  VIDEO_DURATION: z.coerce.number().default(8),
  VIDEO_ASPECT_RATIO: z.enum(['16:9', '9:16']).default('9:16'),
  VIDEO_RESOLUTION: z.enum(['720p', '1080p']).default('720p'),
  VIDEO_PERSON_GENERATION: z.enum(['allow_all', 'allow_adult', 'dont_allow']).default('allow_all'),

  // S3 / MinIO
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string(),
  S3_ACCESS_KEY: z.string(),
  S3_SECRET_KEY: z.string(),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(false),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_GALLERY_EXPIRY: z.string().default('24h'),

  // Limits
  MAX_REFERENCE_IMAGES: z.coerce.number().default(10),

  // Debounce
  MESSAGE_DEBOUNCE_MS: z.coerce.number().default(8_000),

  // WhatsApp Cloud API (Meta official — optional, parallel to Evolution)
  WA_CLOUD_API_TOKEN: z.string().optional(),
  WA_PHONE_NUMBER_ID: z.string().optional(),
  WA_VERIFY_TOKEN: z.string().optional(),
  WA_APP_SECRET: z.string().optional(),

  // Whitelist (set WHITELIST=true to restrict to WHITELIST_NUMBERS only)
  WHITELIST: z.string().default('false').transform((v) => v === 'true' || v === '1'),
  WHITELIST_NUMBERS: z.string().default(''),

  // Admin panel API key (used by the Next.js web panel to authenticate against this backend)
  // Defaults to EVOLUTION_API_KEY for backwards compatibility.
  ADMIN_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
