#!/usr/bin/env bash
#
# DevBox / 发布出去的应用副本，容器启动时执行这个。
#
# ★ 这个文件是【仓库里的正本】。以前它是 bootstrap.sh 内联生成的，
#   而且生成逻辑写了「已存在就不覆盖」—— 结果是改了它也永远同步不到机器上，
#   只能上机器手改。现在改成：每次部署由 deploy.sh 从仓库安装过去，
#   所以改这个文件 → 点一次 Action 就生效。
#
# ★ Sealos DevBox「发布版本 → 部署应用」之后，每个副本都跑这个脚本。
#   所以它必须是【多副本安全】的：不做任何"只能有一个实例"的假设。
#   （迁移由 SchemaMigrationRunner 用 pg_advisory_lock 保证只有一个实例执行。）

set -euo pipefail

APP_DIR=/home/devbox/app

# ---------- 环境变量：容器级优先，.env 只做兜底 ----------
#
# ★★ 顺序不能反。
#
#   直觉写法是 `set -a; . .env; set +a` —— 但那样 .env 会【覆盖】容器级环境变量。
#   发版之后 .env 是被烤进镜像的，于是你在 Sealos 应用里配的数据库地址 / 密钥
#   会被镜像里的旧值静默盖掉：改了不生效、不报错、日志里什么都看不出来。
#   多副本部署时这是头号坑。
#
#   做法：先把容器级环境快照成可重放的形式（export -p），
#   再加载 .env 当默认值，最后把快照重放回去 —— 容器级的赢。
#   这样既保留了 .env 的 shell 引号语义，又让应用配置优先。
if [ -f "$APP_DIR/.env" ]; then
    _envsnap="$(mktemp)"
    export -p >"$_envsnap"
    set -a
    # shellcheck disable=SC1091
    . "$APP_DIR/.env"
    set +a
    # 重放容器级环境。用 set +e 包起来：export -p 里可能有只读变量，
    # 赋值失败不该让整个容器起不来。
    set +e
    # shellcheck disable=SC1090
    . "$_envsnap"
    set -e
    rm -f "$_envsnap"
fi

# ---------- JDK ----------
# ★ 位置由 bootstrap.sh 写在 jdk.env 里，不依赖容器默认的 java
#   （装了新 JDK 系统也不会自动切过去，见 bootstrap.sh 的注释）。
if [ -f "$APP_DIR/jdk.env" ]; then
    # shellcheck disable=SC1091
    . "$APP_DIR/jdk.env"
    PATH="$JAVA_HOME/bin:$PATH"
    export JAVA_HOME PATH
fi

mkdir -p "$APP_DIR/logs"

# 官网静态站，独立端口。放后台起 —— 它挂了不该影响交易平台。
if [ -f "$APP_DIR/site/serve.mjs" ]; then
    PORT="${SITE_PORT:-8081}" nohup node "$APP_DIR/site/serve.mjs" \
        >>"$APP_DIR/logs/site.log" 2>&1 &
fi

# 平台是主进程：用 exec 让它成为 PID 1，直接收到 SIGTERM 而不是等被 KILL。
# ★ 优雅停机对多副本尤其重要 —— 缩容时在途请求要能收尾（server.shutdown: graceful）。
if [ -f "$APP_DIR/app.jar" ]; then
    exec java ${JAVA_OPTS:-} -jar "$APP_DIR/app.jar" >>"$APP_DIR/logs/app.log" 2>&1
fi

echo "no app.jar yet — waiting for the first deploy"
sleep infinity
