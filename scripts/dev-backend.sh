#!/usr/bin/env bash
#
# 本地启动后端（:3001）。
#
# 为什么需要这个脚本：Spring 不会自动读 .env —— 项目里没有 dotenv 依赖，
# application.yml 的默认值是 5432。本机 5432 上跑着 brew 的 postgres，
# 于是「不导出 .env 直接 mvn spring-boot:run」会静默连错库，
# 报出来的却是 `role "mfg" does not exist` / `database "mfg" does not exist`，
# 看着像迁移没跑，实际是连到了另一个 postgres。
#
# 用法：
#   ./scripts/dev-backend.sh             # 等价于 cd backend && mvn spring-boot:run
#   ./scripts/dev-backend.sh -o          # 参数原样透传给 mvn
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -f "$ROOT/.env" ]; then
    # -a: 把 .env 里的变量导出给子进程（mvn / java），而不是只留在本 shell
    set -a
    # shellcheck disable=SC1091
    . "$ROOT/.env"
    set +a
else
    echo "warning: $ROOT/.env 不存在，将使用 application.yml 默认值（通常连不上库）。" >&2
    echo "        先 cp .env.example .env 并按需改端口。" >&2
fi

cd "$ROOT/backend"
exec mvn spring-boot:run "$@"
