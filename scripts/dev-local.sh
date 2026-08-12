#!/usr/bin/env bash
# One-shot local stack: MySQL (+ Redis) → migrate → API + Admin (+ optional H5 / TG)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

WITH_WEB=1
WITH_TG=1
SKIP_DB=0
SKIP_MIGRATE=0
OPEN_BROWSER=0

usage() {
  cat <<'EOF'
用法: scripts/dev-local.sh [选项]

一键启动本地开发环境（MySQL / Redis / API / Admin，默认含 H5 与 Telegram Mini App）。

选项:
  --no-web       不启动用户 H5
  --no-tg        不启动 Telegram Mini App
  --skip-db      不执行 docker compose（假定 MySQL 已在跑）
  --skip-migrate 跳过 prisma migrate deploy
  --open         启动后尝试打开浏览器
  -h, --help     显示帮助

地址:
  API    http://127.0.0.1:3001/health
  Admin  http://127.0.0.1:8000   (默认账号见 .env ADMIN_BOOTSTRAP_*)
  H5     http://127.0.0.1:3000
  TG     http://127.0.0.1:3002

Ctrl+C 会结束本脚本拉起的前后端进程（Docker 容器保持运行）。
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-web) WITH_WEB=0; shift ;;
    --no-tg) WITH_TG=0; shift ;;
    --skip-db) SKIP_DB=1; shift ;;
    --skip-migrate) SKIP_MIGRATE=1; shift ;;
    --open) OPEN_BROWSER=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "未知参数: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

log() { printf '\033[1;36m[dev]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[dev]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[dev]\033[0m %s\n' "$*" >&2; }

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    err "缺少命令: $1"
    exit 1
  fi
}

# Read KEY=value from .env (first match), strip optional quotes
env_get() {
  local key="$1" line val
  line="$(grep -E "^${key}=" .env 2>/dev/null | tail -n 1 || true)"
  [[ -z "$line" ]] && return 0
  val="${line#*=}"
  val="${val%$'\r'}"
  if [[ "$val" == \"*\" && "$val" == *\" ]]; then
    val="${val:1:${#val}-2}"
  elif [[ "$val" == \'*\' && "$val" == *\' ]]; then
    val="${val:1:${#val}-2}"
  fi
  printf '%s' "$val"
}

need_cmd pnpm
need_cmd node

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  err "需要 Node.js >= 20（当前: $(node -v)）"
  exit 1
fi

# --- .env ---
if [[ ! -f .env ]]; then
  if [[ -f .env.example ]]; then
    cp .env.example .env
    warn "已从 .env.example 生成 .env，请按需填写 WireRaw 等密钥"
  else
    err "缺少 .env 与 .env.example"
    exit 1
  fi
fi

DATABASE_URL="$(env_get DATABASE_URL)"
DATABASE_URL="${DATABASE_URL:-mysql://habibi:habibi@127.0.0.1:3308/habibivpn}"
export DATABASE_URL

ADMIN_USER="$(env_get ADMIN_BOOTSTRAP_USERNAME)"
ADMIN_PASS="$(env_get ADMIN_BOOTSTRAP_PASSWORD)"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASS="${ADMIN_PASS:-admin123}"

# --- Docker DB ---
if [[ "$SKIP_DB" -eq 0 ]]; then
  need_cmd docker
  if ! docker info >/dev/null 2>&1; then
    err "Docker 未运行。请先启动 Docker Desktop，或加 --skip-db（若 MySQL 已就绪）"
    exit 1
  fi
  log "启动 MySQL / Redis (docker compose)…"
  docker compose up -d mysql redis
else
  log "跳过 docker compose (--skip-db)"
fi

wait_mysql() {
  log "等待 MySQL 就绪…"
  local tries=60
  while (( tries > 0 )); do
    if [[ "$SKIP_DB" -eq 0 ]] && docker compose exec -T mysql mysqladmin ping -h127.0.0.1 -uroot -proot --silent 2>/dev/null; then
      return 0
    fi
    # TCP probe on mapped port (default 3308)
    if (echo >/dev/tcp/127.0.0.1/3308) >/dev/null 2>&1; then
      sleep 2
      return 0
    fi
    sleep 1
    tries=$((tries - 1))
  done
  err "MySQL 未就绪，请检查: docker compose ps && docker compose logs mysql"
  exit 1
}

wait_mysql

# --- deps / prisma ---
need_reinstall=0
if [[ ! -d node_modules ]]; then
  need_reinstall=1
elif [[ ! -x apps/api/node_modules/.bin/prisma && ! -x node_modules/.bin/prisma ]]; then
  # Partial/broken install (e.g. interrupted pnpm) leaves prisma missing
  need_reinstall=1
fi
if [[ "$need_reinstall" -eq 1 ]]; then
  log "安装依赖 pnpm install…"
  pnpm install
fi
if [[ ! -x apps/api/node_modules/.bin/prisma && ! -x node_modules/.bin/prisma ]]; then
  err "仍找不到 prisma，请手动执行: pnpm install"
  exit 1
fi

if [[ ! -d packages/shared/dist ]]; then
  log "构建 @habibi/shared…"
  pnpm --filter @habibi/shared build
fi

log "prisma generate…"
pnpm --filter @habibi/api prisma:generate

if [[ "$SKIP_MIGRATE" -eq 0 ]]; then
  log "prisma migrate deploy…"
  if ! pnpm --filter @habibi/api prisma:deploy; then
    warn "migrate deploy 失败，请检查 DATABASE_URL / 迁移状态"
    exit 1
  fi
else
  log "跳过 migrate (--skip-migrate)"
fi

# --- run processes ---
PIDS=()
CLEANED=0
cleanup() {
  [[ "$CLEANED" -eq 1 ]] && return 0
  CLEANED=1
  log "正在停止前后端进程…"
  local pid
  for pid in "${PIDS[@]:-}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      # also try children of pnpm
      pkill -P "$pid" 2>/dev/null || true
    fi
  done
  wait 2>/dev/null || true
  log "已停止。Docker 容器仍在运行（pnpm db:down 可关闭）"
}
trap cleanup INT TERM EXIT

log "启动 API (3001)…"
pnpm --filter @habibi/api dev &
PIDS+=($!)

log "启动 Admin (8000)…"
pnpm --filter @habibi/admin dev &
PIDS+=($!)

if [[ "$WITH_WEB" -eq 1 ]]; then
  log "启动 H5 Web (3000)…"
  pnpm --filter @habibi/web dev &
  PIDS+=($!)
fi

if [[ "$WITH_TG" -eq 1 ]]; then
  log "启动 Telegram Mini App (3002)…"
  pnpm --filter @habibi/tg dev &
  PIDS+=($!)
fi

log "等待 API 健康检查…"
for _ in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:3001/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

echo
log "======== 本地开发已启动 ========"
log "API:   http://127.0.0.1:3001/health"
log "Admin: http://127.0.0.1:8000"
if [[ "$WITH_WEB" -eq 1 ]]; then
  log "H5:    http://127.0.0.1:3000"
fi
if [[ "$WITH_TG" -eq 1 ]]; then
  log "TG:    http://127.0.0.1:3002"
fi
log "后台账号: ${ADMIN_USER} / ${ADMIN_PASS}"
log "按 Ctrl+C 停止前后端"
echo

if [[ "$OPEN_BROWSER" -eq 1 ]] && command -v open >/dev/null 2>&1; then
  open "http://127.0.0.1:8000" || true
  [[ "$WITH_WEB" -eq 1 ]] && open "http://127.0.0.1:3000" || true
  [[ "$WITH_TG" -eq 1 ]] && open "http://127.0.0.1:3002" || true
fi

# Keep alive (macOS ships Bash 3.2 — no `wait -n`)
while true; do
  alive=0
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      alive=1
    fi
  done
  if [[ "$alive" -eq 0 ]]; then
    warn "所有子进程已退出"
    break
  fi
  sleep 2
done
# EXIT trap → cleanup
