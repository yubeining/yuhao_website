#!/usr/bin/env bash
#
# 在 DevBox 上拉取源码、构建、交给 deploy.sh 上线。
# 由 GitHub Actions 通过一条 ssh 命令调用（跨境只走这条命令，几 KB）。
#
# 用法：
#   bash /home/devbox/app/src/deploy/devbox/build.sh [分支]
#
# ★ 为什么构建在这里而不是在 GitHub Actions 上
#   跨境传 130 MB 的 fat jar 实测 8 KB/s，要 4 个多小时。
#   源码只有 1.2 MB，依赖走国内镜像 20 MB/s。详见 bootstrap.sh 顶部。
#
# 职责边界：本脚本只负责【产出 app.jar.new】，
# 停旧进程 / 切换 / 健康检查 / 回滚全部由 deploy.sh 负责 —— 那套逻辑已经验证过，
# 不在这里重复实现。
#
set -euo pipefail

APP_DIR="${APP_DIR:-/home/devbox/app}"
SRC_DIR="${SRC_DIR:-$APP_DIR/src}"
BRANCH="${1:-main}"

# ★ 限制 Maven 堆。这台机器 4 GiB 且应用还开着，
#   不限制的话 Maven 默认按物理内存的 1/4 起步，叠加 npm 和运行中的 JVM 容易 OOMKilled。
export MAVEN_OPTS="${MAVEN_OPTS:--Xmx1024m}"

log() { echo "[build $(date '+%H:%M:%S')] $*"; }

# ---------- 0. 把自己复制出去再执行 ----------
# ★ 必须这样做。下一步的 git reset --hard 会覆盖本文件，
#   而 bash 是【边执行边读】脚本文件的 —— 它记录的是字节偏移量，
#   文件在执行途中被换掉，bash 会从新文件的那个偏移量继续读，
#   于是跳到半行中间，报出完全无关的语法错误。
#
#   这个 bug 只在「build.sh 本身有改动的那次部署」才出现，
#   平时改业务代码完全正常 —— 极难联想到是脚本自我覆盖。
SELF="$(readlink -f "$0")"
if [ "$SELF" != "/tmp/mfg-build-running.sh" ]; then
    cp -f "$SELF" /tmp/mfg-build-running.sh
    exec bash /tmp/mfg-build-running.sh "$@"
fi

# ---------- 1. 同步源码 ----------
log "syncing $BRANCH"
git -C "$SRC_DIR" fetch --depth 1 origin "$BRANCH"
git -C "$SRC_DIR" reset --hard "origin/$BRANCH"
# ★ 清掉未跟踪文件：上一次构建留下的 node_modules / target 之外，
#   还有可能是已经从仓库里删掉、但本地还留着的源文件 ——
#   不清的话它们会继续参与编译，出现"仓库里明明删了却还在生效"的怪事。
#   -e 保留构建缓存，否则每次都要重新下载全部依赖。
git -C "$SRC_DIR" clean -fd -e node_modules -e target

log "now at $(git -C "$SRC_DIR" rev-parse --short HEAD) $(git -C "$SRC_DIR" log -1 --pretty=%s | cut -c1-60)"

# ---------- 2. 前端 ----------
log "building portal"
cd "$SRC_DIR/portal"
# npm ci 而不是 npm install：严格按 lock 文件装，构建结果可复现
npm ci --no-audit --no-fund
# npm run build = tsc -b && vite build
# ★ 类型检查是构建的一部分，不要为了快改成只跑 vite build
npm run build

# ---------- 3. 后端 ----------
log "building backend"
cd "$SRC_DIR/backend"
# ★ 把 commit 号打进 jar（build-info.properties），部署后能 curl /public/ping 查出来。
#   没有它，「改了并且部署了但没生效」就是个无法证伪的问题。
COMMIT="$(git -C "$SRC_DIR" rev-parse --short HEAD)"
mvn -B -q clean package -DskipTests "-Dgit.commit=$COMMIT"

# ---------- 4. 校验产物 ----------
# ★ 检查 target/classes 而不是解压 jar —— DevBox 上没有 unzip，
#   而 JRE 也不带 jar 命令。target/classes 就是 BOOT-INF/classes 的来源，
#   检查它等价且不需要任何额外工具。
#
# 这一步存在的理由：这两样任何一个缺失，jar 照样打得出来、部署照样"成功"，
# 表现分别是「网页一片空白但接口正常」和「启动报 missing table」——
# 两者的报错方向都指向别处，在生产上排查很贵。
if [ ! -f target/classes/static/index.html ]; then
    log "FATAL: target/classes/static/index.html missing - the portal build did not land"
    exit 1
fi
if ! ls target/classes/db/migrations/*.sql >/dev/null 2>&1; then
    log "FATAL: no migrations in target/classes/db/migrations - SchemaMigrationRunner would apply none"
    exit 1
fi

JAR="$(ls target/*.jar | head -1)"
log "built $(basename "$JAR") ($(du -h "$JAR" | cut -f1))"
cp -f "$JAR" "$APP_DIR/app.jar.new"

# ---------- 5. 上线 ----------
log "handing over to deploy.sh"
exec bash "$SRC_DIR/deploy/devbox/deploy.sh"
