# ─── Stage 1: Install dependencies ───────────────────────
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/web/package.json ./apps/web/package.json

RUN pnpm install --frozen-lockfile

# ─── Stage 2: Build ─────────────────────────────────────
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/backend/node_modules ./apps/backend/node_modules
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/backend ./apps/backend

# Generate Prisma client
RUN pnpm --filter @ensaio/backend prisma:generate

# Build TypeScript
RUN pnpm --filter @ensaio/backend build

# ─── Stage 3: Production image ──────────────────────────
FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/prisma ./apps/backend/prisma
COPY apps/backend/package.json ./apps/backend/package.json
COPY pnpm-workspace.yaml package.json ./

RUN ./node_modules/.bin/prisma generate --schema=./apps/backend/prisma/schema.prisma

EXPOSE 3000

CMD ["node", "apps/backend/dist/server.js"]
