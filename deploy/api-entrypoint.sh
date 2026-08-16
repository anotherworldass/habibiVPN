#!/bin/sh
set -eu

# host 网络下宿主机 MySQL / Redis 就是 127.0.0.1
if [ -n "${DATABASE_URL:-}" ]; then
  DATABASE_URL=$(printf '%s' "$DATABASE_URL" | sed 's/@host.docker.internal:/@127.0.0.1:/g')
  export DATABASE_URL
fi
if [ -n "${REDIS_URL:-}" ]; then
  REDIS_URL=$(printf '%s' "$REDIS_URL" | sed 's#://host.docker.internal:#://127.0.0.1:#g')
  export REDIS_URL
fi

case "${WIRERAW_HTTP_PROXY:-}" in
  *127.0.0.1*|*localhost*)
    echo "[habibi-api] ignoring WIRERAW_HTTP_PROXY (loopback)"
    unset WIRERAW_HTTP_PROXY
    ;;
esac

cd /app/apps/api
echo "[habibi-api] applying prisma migrations..."
if [ -x ./node_modules/.bin/prisma ]; then
  ./node_modules/.bin/prisma migrate deploy
elif [ -x ../../node_modules/.bin/prisma ]; then
  ../../node_modules/.bin/prisma migrate deploy
else
  echo "[habibi-api] prisma binary not found" >&2
  exit 1
fi

echo "[habibi-api] starting..."
exec node habibi-api.js
