#!/usr/bin/env bash
#
# 部署官网静态站。独立于平台的发布流程。
#
# ★ 为什么和 deploy.sh 分开
#   官网是纯静态的：没有数据库迁移、没有启动自检、换文件就生效。
#   平台不是：它要停旧进程、等健康检查、失败回滚，一次几十秒不可用。
#   合在一起意味着改一句官网文案就要重启整个交易平台 —— 而两者的
#   发版节奏完全不同（市场同事随时改文案，平台按版本发布）。
#
# 用法：bash deploy-site.sh
#
set -euo pipefail

APP_DIR="${APP_DIR:-/home/devbox/app}"
SRC_DIR="${SRC_DIR:-$APP_DIR/src}"
SITE_DIR="$APP_DIR/site"
SITE_PORT="${SITE_PORT:-8081}"
LOG="$APP_DIR/logs/site.log"

log() { echo "[site $(date '+%H:%M:%S')] $*"; }

mkdir -p "$APP_DIR/logs"

if [ ! -f "$SRC_DIR/site/index.html" ]; then
    log "FATAL: $SRC_DIR/site/index.html not found"
    exit 1
fi

# ★ 先同步文件再重启。静态站没有"新旧版本切换"的概念 ——
#   文件就位的那一刻新内容已经生效，重启只是为了让服务器重新读取目录。
log "syncing site files"
rm -rf "$SITE_DIR"
mkdir -p "$SITE_DIR"
cp -R "$SRC_DIR/site/." "$SITE_DIR/"
log "$(find "$SITE_DIR" -type f | wc -l) files, $(du -sh "$SITE_DIR" | cut -f1)"

# ★ 用 pkill -f 精确匹配 serve.mjs，不要匹配 "node" ——
#   这台机器上构建时也会跑 node，宽匹配会把构建进程一起杀掉。
if pkill -f "$SITE_DIR/serve.mjs" 2>/dev/null; then
    log "stopped previous instance"
    sleep 1
fi

cd "$SITE_DIR"
PORT="$SITE_PORT" nohup setsid node serve.mjs >>"$LOG" 2>&1 < /dev/null &
log "started on :$SITE_PORT"

# 等它真的能应答再返回。起不来的话直接失败，不要让部署"成功"却没服务。
waited=0
until curl -fsS --max-time 3 -o /dev/null "http://127.0.0.1:$SITE_PORT/" 2>/dev/null; do
    if [ "$waited" -ge 20 ]; then
        log "FATAL: not responding after ${waited}s"
        tail -n 20 "$LOG" >&2 || true
        exit 1
    fi
    sleep 2
    waited=$((waited + 2))
done

log "site OK — responding on :$SITE_PORT"
