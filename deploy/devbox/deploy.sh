#!/usr/bin/env bash
#
# 在 DevBox 上执行的部署脚本。由 GitHub Actions 通过 SSH 调用。
#
# 用法（Actions 里）：
#   scp app.jar devbox:/home/devbox/app/app.jar.new
#   ssh devbox 'bash /home/devbox/app/deploy.sh'
#
# ★ 核心保证：健康检查不过就自动回滚到上一版。
#   没有这一条，一次构建失误就是线上白屏，而你只能看着日志手动救。
#
set -euo pipefail

APP_DIR="${APP_DIR:-/home/devbox/app}"
JAR_NEW="$APP_DIR/app.jar.new"
JAR_CUR="$APP_DIR/app.jar"
JAR_PREV="$APP_DIR/app.jar.prev"
PID_FILE="$APP_DIR/app.pid"
LOG_DIR="$APP_DIR/logs"
# ★ app.log 现在【由应用的 Logback 自己写并自动轮转】（见 application.yml
#   logging.file.name + logback.rollingpolicy）。所以 nohup 不再重定向到它 ——
#   否则两个写手同写一个文件，内容交织、轮转错乱。
#   nohup 只接 boot.log：JVM 崩溃、OOM、Logback 起来之前的输出这些捞不到别处的。
LOG_FILE="$LOG_DIR/app.log"
BOOT_LOG="$LOG_DIR/boot.log"

HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"
STOP_TIMEOUT="${STOP_TIMEOUT:-30}"

mkdir -p "$LOG_DIR"

# ---------- 环境变量 ----------
# ★ 真值在 GitHub Secrets / Variables，每次部署由 apply-env.sh 覆盖进这个 .env
#   （2026-09-07 起；之前是只在 DevBox 上手填）。这个文件不进 git。
#   apply-env.sh 覆盖前会留一份 .env.prev，回滚时要一并还原，见文末。
if [ -f "$APP_DIR/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    . "$APP_DIR/.env"
    set +a
else
    echo "FATAL: $APP_DIR/.env not found. Run bootstrap.sh first." >&2
    exit 1
fi

PORT="${SERVER_PORT:-8080}"
HEALTH_URL="http://127.0.0.1:${PORT}/actuator/health"

log() { echo "[deploy $(date '+%H:%M:%S')] $*"; }

# ---------- 健康探测 ----------
# curl 和 wget 二选一，都没有就退化成 TCP 探测（bash 的 /dev/tcp）。
# ★ TCP 通 ≠ 应用就绪：迁移跑一半时端口可能已经开了。
#   所以有 curl/wget 时一定优先用它们打 /actuator/health。
probe() {
    if command -v curl >/dev/null 2>&1; then
        curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1
    elif command -v wget >/dev/null 2>&1; then
        wget -q -T 5 -O /dev/null "$HEALTH_URL" >/dev/null 2>&1
    else
        (exec 3<>"/dev/tcp/127.0.0.1/${PORT}") >/dev/null 2>&1
    fi
}

wait_healthy() {
    local waited=0
    while [ "$waited" -lt "$HEALTH_TIMEOUT" ]; do
        # 进程先死了就不必再等满超时 —— 早失败早回滚
        if [ -f "$PID_FILE" ] && ! kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
            log "process exited during startup"
            return 1
        fi
        if probe; then
            log "healthy after ${waited}s"
            return 0
        fi
        sleep 3
        waited=$((waited + 3))
    done
    log "health check timed out after ${HEALTH_TIMEOUT}s"
    return 1
}

# ---------- 起停 ----------
stop_app() {
    [ -f "$PID_FILE" ] || return 0
    local pid
    pid="$(cat "$PID_FILE")"
    if ! kill -0 "$pid" 2>/dev/null; then
        rm -f "$PID_FILE"
        return 0
    fi

    # ★ 先 SIGTERM。application.yml 配了 graceful shutdown，
    #   在途请求有 20 秒收尾时间。直接 KILL 会让正在提交的报价连接中断。
    log "stopping pid $pid"
    kill -TERM "$pid" 2>/dev/null || true
    local waited=0
    while kill -0 "$pid" 2>/dev/null && [ "$waited" -lt "$STOP_TIMEOUT" ]; do
        sleep 1
        waited=$((waited + 1))
    done
    if kill -0 "$pid" 2>/dev/null; then
        log "did not stop in ${STOP_TIMEOUT}s, sending KILL"
        kill -KILL "$pid" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
}

start_app() {
    log "starting"
    # shellcheck disable=SC2086
    # -DLOG_PATH 告诉 Logback 把 app.log 写进 $LOG_DIR（绝对路径），
    # 不受 nohup 启动时 cwd 的影响。
    nohup java ${JAVA_OPTS:-} -DLOG_PATH="$LOG_DIR" -jar "$JAR_CUR" >>"$BOOT_LOG" 2>&1 &
    echo $! >"$PID_FILE"
    log "pid $(cat "$PID_FILE")"
}

# ---------- 主流程 ----------
if [ ! -f "$JAR_NEW" ]; then
    echo "FATAL: $JAR_NEW not found. Did scp succeed?" >&2
    exit 1
fi

stop_app

# 保留上一版用于回滚
if [ -f "$JAR_CUR" ]; then
    cp -f "$JAR_CUR" "$JAR_PREV"
fi
mv -f "$JAR_NEW" "$JAR_CUR"

start_app

if wait_healthy; then
    log "deploy OK"
    # 新配置已被证明能用，备份不再需要
    rm -f "$APP_DIR/.env.prev"
    exit 0
fi

# ---------- 回滚 ----------
log "deploy FAILED, last 60 lines of app log:"
tail -n 60 "$LOG_FILE" >&2 2>/dev/null || true
# Logback 起来之前就崩的（配置错、OOM、JVM 参数错）在 boot.log 里，app.log 可能是空的
log "--- boot.log (pre-logback / crash output) ---"
tail -n 20 "$BOOT_LOG" >&2 2>/dev/null || true

if [ ! -f "$JAR_PREV" ]; then
    log "no previous version to roll back to; leaving the app down"
    exit 1
fi

log "rolling back to previous version"
stop_app
mv -f "$JAR_PREV" "$JAR_CUR"
# ★ 配置也要回滚：本次部署刚由 apply-env.sh 覆盖过 .env。
#   口令填错时只回滚 jar 不回滚配置，旧版拿着同一个错口令一样起不来。
if [ -f "$APP_DIR/.env.prev" ]; then
    log "restoring previous .env"
    mv -f "$APP_DIR/.env.prev" "$APP_DIR/.env"
    set -a
    # shellcheck disable=SC1091
    . "$APP_DIR/.env"
    set +a
fi
start_app

if wait_healthy; then
    log "rollback OK — previous version is serving again"
else
    log "ROLLBACK ALSO FAILED — the app is down, manual intervention needed"
fi
# ★ 无论回滚成功与否都以非 0 退出：这次部署没有成功，
#   Actions 必须显示红色。回滚成功只是止血，不是部署成功。
exit 1
