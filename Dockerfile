FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/web/package.json ./apps/web/package.json

RUN pnpm install --frozen-lockfile

COPY apps/backend ./apps/backend
COPY apps/web ./apps/web

RUN pnpm --filter @ensaio/backend prisma:generate
RUN pnpm --filter @ensaio/backend build

# Next.js standalone build — NEXT_PUBLIC_ vars are baked at build time
ARG NEXT_PUBLIC_API_URL=http://localhost:3000
ARG NEXT_PUBLIC_ADMIN_KEY=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_ADMIN_KEY=$NEXT_PUBLIC_ADMIN_KEY

RUN pnpm --filter @ensaio/web build

# Copy static assets into standalone output
RUN cp -r apps/web/public apps/web/.next/standalone/apps/web/public 2>/dev/null || true
RUN cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static

COPY start.sh ./start.sh
RUN chmod +x start.sh

ENV NODE_ENV=production
# Basic auth for admin panel (set at runtime)
# ENV ADMIN_USER=admin
# ENV ADMIN_PASS=
EXPOSE 3000 3001

CMD ["./start.sh"]
