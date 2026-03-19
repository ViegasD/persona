FROM node:20-alpine
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/web/package.json ./apps/web/package.json

RUN npm install

COPY apps/backend ./apps/backend

RUN npx prisma generate --schema=apps/backend/prisma/schema.prisma
RUN npm run build --prefix apps/backend

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "apps/backend/dist/server.js"]
