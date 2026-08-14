#!/bin/sh
set -eu

cd /app
echo "[habibi-api] applying prisma migrations..."
pnpm --filter @habibi/api prisma:deploy

cd /app/apps/api
echo "[habibi-api] starting..."
exec node habibi-api.js
