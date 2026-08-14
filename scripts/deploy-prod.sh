#!/usr/bin/env bash
# 宝塔计划任务 / crontab 调用：有新提交才构建并切换容器。
# 强制重建：FORCE=1 bash scripts/deploy-prod.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOCK="$ROOT/.deploy.lock"
exec 9>"$LOCK"
if ! flock -n 9; then
  echo "[deploy] another deploy is running, skip"
  exit 0
fi

COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env)

if [[ ! -f .env ]]; then
  echo "[deploy] missing $ROOT/.env" >&2
  exit 1
fi

need_build=0
if [[ "${FORCE:-0}" == "1" ]]; then
  need_build=1
elif [[ ! -d .git ]]; then
  echo "[deploy] not a git checkout, building anyway"
  need_build=1
else
  git fetch --quiet origin
  local_rev="$(git rev-parse HEAD)"
  if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
    remote_rev="$(git rev-parse '@{u}')"
  else
    branch="$(git rev-parse --abbrev-ref HEAD)"
    remote_rev="$(git rev-parse "origin/${branch}")"
  fi
  if [[ "$local_rev" != "$remote_rev" ]]; then
    echo "[deploy] ${local_rev:0:8} -> ${remote_rev:0:8}"
    git pull --ff-only
    need_build=1
  fi
fi

if [[ "$need_build" -eq 0 ]]; then
  echo "[deploy] already up to date"
  exit 0
fi

echo "[deploy] dropping stale compose containers..."
"${COMPOSE[@]}" down --remove-orphans || true
docker rm -f habibivpn-api-1 habibivpn-web-1 habibivpn-tg-1 habibivpn-admin-1 2>/dev/null || true

echo "[deploy] building and switching containers..."
if ! "${COMPOSE[@]}" up -d --build --remove-orphans; then
  echo "[deploy] up failed, retry after cleanup..."
  "${COMPOSE[@]}" down --remove-orphans || true
  docker rm -f habibivpn-api-1 habibivpn-web-1 habibivpn-tg-1 habibivpn-admin-1 2>/dev/null || true
  "${COMPOSE[@]}" up -d --remove-orphans
fi

echo "[deploy] waiting for API..."
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3001/health/ready >/dev/null; then
    echo "[deploy] API ready"
    curl -fsSI http://127.0.0.1:3000 >/dev/null || true
    curl -fsSI http://127.0.0.1:3002 >/dev/null || true
    "${COMPOSE[@]}" ps
    exit 0
  fi
  sleep 2
done

echo "[deploy] API did not become ready" >&2
"${COMPOSE[@]}" logs --tail 80 api
exit 1
