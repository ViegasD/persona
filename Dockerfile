FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/web/package.json ./apps/web/package.json

RUN pnpm install --frozen-lockfile

COPY apps/backend ./apps/backend

RUN pnpm --filter @ensaio/backend prisma:generate
RUN pnpm --filter @ensaio/backend build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "apps/backend/dist/server.js"]
