#!/bin/sh
# Start both backend and web admin panel
# Backend on :3000, Web on :3001

set -e

# Wait for PostgreSQL to be ready (up to 60s)
echo "Waiting for PostgreSQL..."
MAX_RETRIES=12
RETRY=0
while [ $RETRY -lt $MAX_RETRIES ]; do
  if node -e "
    const url = new URL(process.env.DATABASE_URL);
    const net = require('net');
    const s = net.createConnection({host: url.hostname, port: url.port || 5432}, () => { s.destroy(); process.exit(0); });
    s.on('error', () => process.exit(1));
    setTimeout(() => process.exit(1), 3000);
  " 2>/dev/null; then
    echo "  PostgreSQL is reachable."
    break
  fi
  RETRY=$((RETRY + 1))
  echo "  DB not ready, retrying ($RETRY/$MAX_RETRIES)..."
  sleep 5
done

if [ $RETRY -eq $MAX_RETRIES ]; then
  echo "ERROR: PostgreSQL not reachable after ${MAX_RETRIES} retries"
  exit 1
fi

# Apply any pending Prisma migrations
echo "Running migrations..."
cd /app/apps/backend && npx prisma migrate deploy
cd /app
echo "Migrations done."

node /app/apps/backend/dist/server.js &
BACKEND_PID=$!

PORT=3001 HOSTNAME=0.0.0.0 node /app/apps/web/.next/standalone/apps/web/server.js &
WEB_PID=$!

echo "Backend PID=$BACKEND_PID on :3000"
echo "Web admin PID=$WEB_PID on :3001"

# If either process exits, kill the other and exit
trap "kill $BACKEND_PID $WEB_PID 2>/dev/null; exit 1" TERM INT

wait -n $BACKEND_PID $WEB_PID
EXIT_CODE=$?

kill $BACKEND_PID $WEB_PID 2>/dev/null
exit $EXIT_CODE
