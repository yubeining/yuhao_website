#!/usr/bin/env bash
#
# DevBox 一次性初始化。只需要跑一次（换 DevBox 才需要再跑）。
#
# 用法：把本文件传到 DevBox 上执行
#   scp deploy/devbox/bootstrap.sh devbox:/tmp/
#   ssh devbox 'bash /tmp/bootstrap.sh'
#
# 做三件事：
#   1. 确保有 JRE 21
#   2. 建目录结构和 .env 模板
#   3. 装 entrypoint —— 让 DevBox 容器重启后应用能自己起来
#
set -euo pipefail

APP_DIR="${APP_DIR:-/home/devbox/app}"

log() { echo "[bootstrap] $*"; }

# ---------- 1. JRE ----------
need_jre=1
if command -v java >/dev/null 2>&1; then
    ver="$(java -version 2>&1 | head -1)"
    log "found: $ver"
    # 21 及以上都行
    major="$(java -version 2>&1 | head -1 | sed -n 's/.*version "\([0-9]*\).*/\1/p')"
    if [ -n "$major" ] && [ "$major" -ge 21 ] 2>/dev/null; then
        need_jre=0
    else
        log "java is older than 21, installing"
    fi
fi

if [ "$need_jre" -eq 1 ]; then
    log "installing openjdk-21-jre-headless"
    # ★ 只装 headless。完整 JRE 会拖进一堆 X11 / 字体依赖，
    #   这是个纯 HTTP 服务，一个都用不上。
    if command -v sudo >/dev/null 2>&1; then SUDO=sudo; else SUDO=; fi
    $SUDO apt-get update -qq
    $SUDO apt-get install -y --no-install-recommends openjdk-21-jre-headless
    java -version
fi

# ---------- 2. 目录与配置 ----------
mkdir -p "$APP_DIR/logs"
log "app dir: $APP_DIR"

if [ ! -f "$APP_DIR/.env" ]; then
    cat >"$APP_DIR/.env" <<'ENVEOF'
# ★★ 生产配置。这个文件【只存在于 DevBox 上】，不进 git、不经过 GitHub。
#
#    GitHub Actions 只负责把 app.jar 送过来，从不接触这里的任何值 ——
#    这样即使 GitHub 侧的 token 泄露，数据库口令也不会跟着泄露。
#
#    改完这个文件后需要重新部署（或手动重启）才生效。

# ---------- 端口 ----------
# Sealos DevBox 的网络配置里对外暴露的端口
SERVER_PORT=8080

# ---------- PostgreSQL ----------
# 用 Sealos「数据库」应用创建的实例，填【内网】地址
DB_URL=jdbc:postgresql://<pg-内网地址>:5432/mfg
DB_USERNAME=<用户名>
DB_PASSWORD=<口令>

# ---------- Redis ----------
REDIS_HOST=<redis-内网地址>
REDIS_PORT=6379
REDIS_PASSWORD=<口令>

# ---------- JWT ----------
# ★ 必填，至少 32 字节。生成：openssl rand -base64 48
#   绝不与本地开发或任何其他环境共用同一个值。
JWT_SECRET=

# ---------- 开发后门 ----------
# ★★★ 必须是 false。true = 任何人 POST 一下就能拿到 OPERATOR token，
#      前面所有的隔离设计瞬间作废。
DEV_LOGIN_ENABLED=false

# ---------- JVM ----------
# DevBox 是 4 GiB。MaxRAMPercentage 而不是写死 -Xmx，
# 换规格时不用改这里，也不会被 OOMKilled 得莫名其妙。
JAVA_OPTS=-XX:MaxRAMPercentage=70 -XX:+ExitOnOutOfMemoryError -Duser.timezone=Asia/Shanghai
ENVEOF
    chmod 600 "$APP_DIR/.env"
    log "created $APP_DIR/.env  ← ★ 现在去把里面的占位符填掉"
else
    log ".env already exists, leaving it alone"
fi

# ---------- 3. 容器重启后自动拉起 ----------
# ★ DevBox 是容器不是虚拟机，通常【没有 systemd】。
#   所以用 Sealos DevBox 约定的 entrypoint.sh 来保证重启后应用能起来。
#   没有这一步，DevBox 一被暂停/重启，应用就再也不会自己回来。
ENTRYPOINT=/home/devbox/project/entrypoint.sh
mkdir -p "$(dirname "$ENTRYPOINT")"
if [ ! -f "$ENTRYPOINT" ] || ! grep -q "app.jar" "$ENTRYPOINT" 2>/dev/null; then
    cat >"$ENTRYPOINT" <<'EPEOF'
#!/usr/bin/env bash
# DevBox 容器启动时执行。由 deploy/devbox/bootstrap.sh 生成。
set -euo pipefail
APP_DIR=/home/devbox/app
[ -f "$APP_DIR/.env" ] && { set -a; . "$APP_DIR/.env"; set +a; }
mkdir -p "$APP_DIR/logs"
if [ -f "$APP_DIR/app.jar" ]; then
    exec java ${JAVA_OPTS:-} -jar "$APP_DIR/app.jar" >>"$APP_DIR/logs/app.log" 2>&1
fi
echo "no app.jar yet — waiting for the first deploy"
sleep infinity
EPEOF
    chmod +x "$ENTRYPOINT"
    log "installed $ENTRYPOINT"
else
    log "entrypoint already references app.jar, leaving it alone"
fi

log ""
log "完成。接下来："
log "  1. 编辑 $APP_DIR/.env，填数据库和 JWT_SECRET"
log "  2. 在 GitHub 上点 Actions → Deploy to Sealos DevBox → Run workflow"
