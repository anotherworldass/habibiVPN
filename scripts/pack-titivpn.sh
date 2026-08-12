#!/usr/bin/env bash
# 仓库根目录快捷入口 → clients/TiTiVPN/tool/pack.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec "$ROOT/clients/TiTiVPN/tool/pack.sh" "$@"
