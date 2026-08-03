#!/usr/bin/env bash
#
# 在 DevBox 上拉取源码、构建、交给 deploy.sh 上线。
# 由 GitHub Actions 通过一条 ssh 命令调用（跨境只走这条命令，几 KB）。
#
# 用法：
#   bash /home/devbox/app/src/deploy/devbox/build.sh
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
#    手动使用（本机已有源码时）：
#      MFG_COMMIT=abc1234 bash deploy/devbox/build.sh
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

# ★ 限制 Maven 堆。这台机器 4 GiB 且应用还开着，
#   不限制的话 Maven 默认按物理内存的 1/4 起步，叠加 npm 和运行中的 JVM 容易 OOMKilled。
export MAVEN_OPTS="${MAVEN_OPTS:--Xmx1024m}"

log() { echo "[build $(date '+%H:%M:%S')] $*"; }

# ---------- 1. 确认源码版本 ----------
# ★ commit 由调用方通过 MFG_COMMIT 传入，【不再从 git 读】。
#
#   仓库转私有后 DevBox 拉不到代码，改成由 Actions 用 rsync 推源码过来，
#   这台机器上已经没有 .git 了。如果还留着旧的 .git 并用 git rev-parse，
#   拿到的会是一个过时且错误的 commit —— 那比返回 unknown 危险得多：
#   它会让你确信线上跑的是某个版本，而实际上不是。
COMMIT="${MFG_COMMIT:-unknown}"
log "building commit $COMMIT"

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
