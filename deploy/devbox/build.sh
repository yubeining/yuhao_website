#!/usr/bin/env bash
#
# 在 DevBox 上构建。由 GitHub Actions 分阶段调用，每个阶段在 Actions 里是独立一步。
#
# 用法：
#   bash build.sh portal     只构建前端
#   bash build.sh backend    只构建后端（依赖 portal 阶段的产物）
#   bash build.sh all        两个都构建（手动用）
#
# ★ 为什么拆成阶段而不是一个脚本跑到底
#   Actions 的日志按 step 折叠。全塞进一步的话，前端和后端的输出混在一起，
#   耗时也只有一个总数 —— 想知道"是前端慢还是后端慢"只能翻日志数时间戳。
#   拆开之后每一步的耗时和成败在 Actions 界面上一目了然。
#
# ★★ 本脚本【不同步源码】，也【不读 git】。调用方负责把源码放到位。
#
#    仓库转为私有之后，DevBox 已经没有拉取权限了。改成由 GitHub Actions
#    checkout 之后用 rsync 把源码推过来 —— 排除 .git / node_modules / target
#    之后只有 0.59 MB，而且 rsync 是增量的，之后每次只传改动的几 KB。
#
#    历史上这里踩过两个坑，都记在这：
#    1. 本脚本原本自己 git reset 再执行刚被覆盖的自己，为此要先拷到 /tmp。
#       代价是【对本文件的修改永远晚一个版本生效】且完全静默 ——
#       加了 -Dgit.commit 之后部署报绿，线上 commit 仍是 unknown。
#    2. 现在机器上没有 .git 了。若还留着旧的 .git 去 git rev-parse，
#       会拿到一个过时且错误的 commit —— 比 unknown 危险得多，
#       它会让你确信线上是某个版本，而实际不是。
#
# ★ 为什么构建在这里而不是在 GitHub Actions 上
#   跨境传 130 MB 的 fat jar 实测 8 KB/s，要 4 个多小时。
#   源码只有 1.2 MB，依赖走国内镜像 20 MB/s。详见 bootstrap.sh 顶部。
#
# 职责边界：本脚本只负责【产出 app.jar.new】，
# 停旧进程 / 切换 / 健康检查 / 回滚全部由 deploy.sh 负责。
#
set -euo pipefail

APP_DIR="${APP_DIR:-/home/devbox/app}"
SRC_DIR="${SRC_DIR:-$APP_DIR/src}"
STAGE="${1:-all}"

# ★ commit 由调用方通过 MFG_COMMIT 传入，不再从 git 读（见上）。
COMMIT="${MFG_COMMIT:-unknown}"

# ★ 限制 Maven 堆。这台机器 4 GiB 且应用还开着，
#   不限制的话 Maven 默认按物理内存的 1/4 起步，叠加 npm 和运行中的 JVM 容易 OOMKilled。
export MAVEN_OPTS="${MAVEN_OPTS:--Xmx1024m}"

log() { echo "[$STAGE $(date '+%H:%M:%S')] $*"; }

# ---------- 前端 ----------
build_portal() {
    log "commit $COMMIT"
    cd "$SRC_DIR/portal"

    local t0=$SECONDS
    # npm ci 而不是 npm install：严格按 lock 文件装，构建结果可复现
    npm ci --no-audit --no-fund
    log "deps installed in $((SECONDS - t0))s"

    t0=$SECONDS
    # npm run build = tsc -b && vite build
    # ★ 类型检查是构建的一部分，不要为了快改成只跑 vite build
    npm run build
    log "portal built in $((SECONDS - t0))s"

    # 产物落在 backend/src/main/resources/static（见 vite.config.ts 的 outDir）
    local static_dir="$SRC_DIR/backend/src/main/resources/static"
    if [ ! -f "$static_dir/index.html" ]; then
        log "FATAL: $static_dir/index.html missing - vite outDir may have changed"
        exit 1
    fi
    log "static payload: $(du -sh "$static_dir" | cut -f1), $(find "$static_dir" -type f | wc -l) files"
}

# ---------- 后端 ----------
build_backend() {
    log "commit $COMMIT"
    cd "$SRC_DIR/backend"

    # ★ 依赖前端阶段：static/ 必须已经存在，否则打出来的 jar 没有前端，
    #   部署会"成功"但网页一片空白，而后端日志毫无异常。
    if [ ! -f src/main/resources/static/index.html ]; then
        log "FATAL: portal output missing - run the portal stage first"
        exit 1
    fi

    local t0=$SECONDS
    # ★ 把 commit 号打进 jar（build-info.properties），部署后能 curl /public/ping 查出来。
    #   没有它，「改了并且部署了但没生效」就是个无法证伪的问题。
    mvn -B -q clean package -DskipTests "-Dgit.commit=$COMMIT"
    log "packaged in $((SECONDS - t0))s"

    # ★ 校验 target/classes 而不是解压 jar —— DevBox 上没有 unzip，
    #   JRE 也不带 jar 命令。target/classes 就是 BOOT-INF/classes 的来源。
    if [ ! -f target/classes/static/index.html ]; then
        log "FATAL: static/ did not make it into the build output"
        exit 1
    fi
    if ! ls target/classes/db/migrations/*.sql >/dev/null 2>&1; then
        log "FATAL: no migrations in build output - SchemaMigrationRunner would apply none"
        exit 1
    fi
    log "verified: static + $(ls target/classes/db/migrations/*.sql | wc -l) migrations are in the build"

    local jar
    jar="$(ls target/*.jar | head -1)"
    log "jar: $(basename "$jar") $(du -h "$jar" | cut -f1)"
    cp -f "$jar" "$APP_DIR/app.jar.new"
    log "staged at $APP_DIR/app.jar.new"
}

case "$STAGE" in
    portal)  build_portal ;;
    backend) build_backend ;;
    all)
        STAGE=portal  build_portal
        STAGE=backend build_backend
        STAGE=deploy  exec bash "$SRC_DIR/deploy/devbox/deploy.sh"
        ;;
    *)
        echo "usage: build.sh [portal|backend|all]" >&2
        exit 2
        ;;
esac
