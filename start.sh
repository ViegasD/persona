#!/bin/sh
# Start both backend and web admin panel
# Backend on :3000, Web on :3001

# Apply any pending Prisma migrations
cd apps/backend && npx prisma migrate deploy && cd /app

node apps/backend/dist/server.js &
BACKEND_PID=$!

PORT=3001 HOSTNAME=0.0.0.0 node apps/web/.next/standalone/apps/web/server.js &
WEB_PID=$!

echo "Backend PID=$BACKEND_PID on :3000"
echo "Web admin PID=$WEB_PID on :3001"

# If either process exits, kill the other and exit
trap "kill $BACKEND_PID $WEB_PID 2>/dev/null; exit 1" TERM INT

wait -n $BACKEND_PID $WEB_PID
EXIT_CODE=$?

kill $BACKEND_PID $WEB_PID 2>/dev/null
exit $EXIT_CODE
