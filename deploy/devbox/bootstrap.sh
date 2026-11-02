#!/usr/bin/env bash
#
# DevBox 一次性初始化。幂等，可以重复跑。
#
# 用法：
#   scp deploy/devbox/bootstrap.sh devbox:/tmp/
#   ssh devbox 'bash /tmp/bootstrap.sh'
#
# ★★ 为什么构建在 DevBox 上做，而不是在 GitHub Actions 上做完再传
#
#    最初的方案是 Actions 打包好 jar 再 scp 过来。实测跨境速率 8 KB/s，
#    130 MB 的 fat jar 要传 4 个多小时 —— GitHub 的 runner 在美欧，
#    Sealos 在北京，这条链路就是这个量级，不是配置问题。
#
#    改成 DevBox 自己构建之后：
#      跨境的只有源码       1.2 MB，秒级
#      Maven 依赖走阿里云    实测 20 MB/s
#      npm 依赖走 npmmirror  境内
#    Actions 那边只发一条 ssh 命令，几 KB。
#
# 做的事（全部幂等）：
#   1. JDK 25（构建要 JDK 不是 JRE —— javac 在 JDK 里）
#   2. Maven + Node 22，并配好国内镜像
#   3. clone 仓库
#   4. 目录结构和 .env 模板
#   5. entrypoint —— 让 DevBox 容器重启后应用能自己起来
#
set -euo pipefail

APP_DIR="${APP_DIR:-/home/devbox/app}"
SRC_DIR="$APP_DIR/src"
REPO_URL="${REPO_URL:-https://github.com/yubeining/yuhao_website.git}"
NODE_VERSION="${NODE_VERSION:-22.9.0}"

log() { echo "[bootstrap] $*"; }

if command -v sudo >/dev/null 2>&1; then SUDO=sudo; else SUDO=; fi

# ---------- 0. apt 换国内源 ----------
# ★ Sealos 的 Ubuntu 镜像默认用 archive.ubuntu.com，从北京拉是跨境的。
#   实测：装一个 82 MB 的 JDK 跑了 7 分钟还没完，中途 SSH 都被断了两次；
#   换清华源之后同一个包几十秒。
#
#   这和 Maven / npm 换镜像是同一件事 —— 这台机器上【所有】默认指向境外的
#   包管理器都要换，否则每次都会在某个意想不到的地方卡住，
#   而卡住的表现（连接超时 / 传输极慢）看不出是源的问题。
UBUNTU_SOURCES=/etc/apt/sources.list.d/ubuntu.sources
if [ -f "$UBUNTU_SOURCES" ] && grep -q "archive.ubuntu.com" "$UBUNTU_SOURCES"; then
    log "switching apt to tsinghua mirror"
    $SUDO cp -n "$UBUNTU_SOURCES" "$UBUNTU_SOURCES.bak"
    $SUDO sed -i \
        -e 's|http://archive.ubuntu.com/ubuntu/|https://mirrors.tuna.tsinghua.edu.cn/ubuntu/|' \
        -e 's|http://security.ubuntu.com/ubuntu/|https://mirrors.tuna.tsinghua.edu.cn/ubuntu/|' \
        "$UBUNTU_SOURCES"
    $SUDO apt-get update -qq
elif [ -f /etc/apt/sources.list ] && grep -q "archive.ubuntu.com" /etc/apt/sources.list; then
    # 老格式（22.04 及以前）
    log "switching apt to tsinghua mirror (legacy sources.list)"
    $SUDO cp -n /etc/apt/sources.list /etc/apt/sources.list.bak
    $SUDO sed -i \
        -e 's|http://archive.ubuntu.com/ubuntu/|https://mirrors.tuna.tsinghua.edu.cn/ubuntu/|' \
        -e 's|http://security.ubuntu.com/ubuntu/|https://mirrors.tuna.tsinghua.edu.cn/ubuntu/|' \
        /etc/apt/sources.list
    $SUDO apt-get update -qq
else
    log "apt sources already look fine"
fi

# ---------- 1. JDK 25 ----------
# ★ 要 JDK 不是 JRE —— 在这台机器上编译，javac 只在 JDK 里。
# ★ 版本下限必须是 25（pom 的 java.version=25，21 编不了）。
#   以前这里的正则写的是 2[1-9]，会把已装的 javac 21 判成合格、从而永远不升级 —— 已收紧。
#
# ★★ 这一段刻意【不依赖】两件不可靠的事：
#    1) 发行版源里有没有 openjdk-25 —— Ubuntu LTS 常常没有。装不到就退回 Temurin tarball。
#    2) 系统默认的 java 指向谁 —— 装了新 JDK，Ubuntu 也不会自动把 java 切过去；
#       而且 CI 是【非交互 ssh】（ssh host "bash build.sh"），根本不读 ~/.bashrc。
#    所以装完把 JAVA_HOME 写进 $APP_DIR/jdk.env，由 build.sh / deploy.sh / entrypoint 自己 source。
#    "装上了却没用上" 是这里最容易踩、也最难查的坑。
mkdir -p "$APP_DIR"
JDK_HOME=""

# (a) 已经有 25+ 就直接用
if command -v javac >/dev/null 2>&1 \
   && javac -version 2>&1 | grep -qE 'javac (2[5-9]|[3-9][0-9])'; then
    JDK_HOME="$(dirname "$(dirname "$(readlink -f "$(command -v javac)")")")"
    log "found existing JDK: $(javac -version 2>&1) at $JDK_HOME"
fi

# (b) 试发行版源
if [ -z "$JDK_HOME" ]; then
    log "trying apt: openjdk-25-jdk-headless"
    $SUDO apt-get update -qq || true
    if $SUDO apt-get install -y --no-install-recommends openjdk-25-jdk-headless >/dev/null 2>&1; then
        JDK_HOME="$(ls -d /usr/lib/jvm/java-25-openjdk-* 2>/dev/null | head -1)"
        log "installed from apt: $JDK_HOME"
    else
        log "apt has no openjdk-25 here — falling back to Temurin tarball"
    fi
fi

# (c) Temurin tarball：不需要发行版支持，也不需要 sudo
if [ -z "$JDK_HOME" ] || [ ! -x "$JDK_HOME/bin/javac" ]; then
    case "$(uname -m)" in
        x86_64|amd64)  TEMURIN_ARCH=x64 ;;
        aarch64|arm64) TEMURIN_ARCH=aarch64 ;;
        *) log "ERROR: unsupported arch $(uname -m)"; exit 1 ;;
    esac
    JDK_HOME="$APP_DIR/jdk25"
    if [ ! -x "$JDK_HOME/bin/javac" ]; then
        log "downloading Temurin 25 ($TEMURIN_ARCH) into $JDK_HOME"
        mkdir -p "$JDK_HOME"
        TEMURIN_URL="https://api.adoptium.net/v3/binary/latest/25/ga/linux/$TEMURIN_ARCH/jdk/hotspot/normal/eclipse"
        if command -v curl >/dev/null 2>&1; then
            curl -fsSL "$TEMURIN_URL" | tar -xz -C "$JDK_HOME" --strip-components=1
        else
            wget -qO- "$TEMURIN_URL" | tar -xz -C "$JDK_HOME" --strip-components=1
        fi
    fi
fi

# 校验后落盘 —— 后面所有脚本都认这个文件，不认 PATH 上的 java
if ! "$JDK_HOME/bin/javac" -version 2>&1 | grep -qE 'javac (2[5-9]|[3-9][0-9])'; then
    log "ERROR: $JDK_HOME is not a JDK 25+"
    exit 1
fi
printf 'JAVA_HOME=%s\n' "$JDK_HOME" > "$APP_DIR/jdk.env"
log "JDK ready: $("$JDK_HOME/bin/javac" -version 2>&1)  ->  recorded in $APP_DIR/jdk.env"

# ---------- 2. Maven + Node，配国内镜像 ----------
if command -v mvn >/dev/null 2>&1; then
    log "maven ok: $(mvn -v 2>/dev/null | head -1)"
else
    log "installing maven"
    $SUDO apt-get install -y --no-install-recommends maven
fi

# ★ Maven 走阿里云。不配的话依赖从 repo1.maven.org 拉，跨境几十分钟起步；
#   配了之后实测 20 MB/s。
mkdir -p "$HOME/.m2"
if [ ! -f "$HOME/.m2/settings.xml" ]; then
    cat >"$HOME/.m2/settings.xml" <<'M2EOF'
<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0">
  <mirrors>
    <mirror>
      <id>aliyun</id>
      <name>aliyun public</name>
      <url>https://maven.aliyun.com/repository/public</url>
      <mirrorOf>central</mirrorOf>
    </mirror>
  </mirrors>
</settings>
M2EOF
    log "wrote ~/.m2/settings.xml (aliyun mirror)"
else
    log "~/.m2/settings.xml exists, leaving it alone"
fi

# Node：apt 上是 18（已 EOL 且 vite 6 不支持），所以直接取官方二进制。
# ★ 走清华镜像 —— 实测 54 MB/s，npmmirror 是 17 MB/s，nodejs.org 跨境更慢。
#
# ★★ 用 .tar.gz 不用 .tar.xz。
#    xz 压得更小，但这台 DevBox 上【没有装 xz】，tar -xJf 会报
#    "xz: Cannot exec: No such file or directory" 然后脚本直接退出。
#    为省 5 MB 传输量而引入一个额外的系统依赖不划算 —— 尤其是在
#    这个依赖缺失时，报错信息指向 tar 而不是指向"少装了个包"。
if command -v node >/dev/null 2>&1 && node -v | grep -qE '^v(2[2-9]|[3-9][0-9])'; then
    log "node ok: $(node -v)"
else
    log "installing node v$NODE_VERSION"
    TARBALL="node-v${NODE_VERSION}-linux-x64.tar.gz"
    curl -fsSL -o "/tmp/$TARBALL" \
        "https://mirrors.tuna.tsinghua.edu.cn/nodejs-release/v${NODE_VERSION}/${TARBALL}" \
      || curl -fsSL -o "/tmp/$TARBALL" \
        "https://cdn.npmmirror.com/binaries/node/v${NODE_VERSION}/${TARBALL}"
    $SUDO tar -xzf "/tmp/$TARBALL" -C /usr/local --strip-components=1 \
        --exclude=CHANGELOG.md --exclude=LICENSE --exclude=README.md
    rm -f "/tmp/$TARBALL"
    log "node: $(node -v)  npm: $(npm -v)"
fi

npm config set registry https://registry.npmmirror.com >/dev/null 2>&1 || true
log "npm registry: $(npm config get registry)"

# ---------- 3. 源码 ----------
if [ -d "$SRC_DIR/.git" ]; then
    log "repo already cloned at $SRC_DIR"
else
    log "cloning $REPO_URL"
    mkdir -p "$(dirname "$SRC_DIR")"
    # ★ --depth 1：只要最新一次提交。完整历史对构建毫无用处，
    #   而跨境拉取时它是唯一会随时间变大的部分。
    git clone --depth 1 "$REPO_URL" "$SRC_DIR"
fi

# ---------- 4. 目录与配置 ----------
mkdir -p "$APP_DIR/logs"
log "app dir: $APP_DIR"

if [ ! -f "$APP_DIR/.env" ]; then
    cat >"$APP_DIR/.env" <<'ENVEOF'
# ★★ 生产配置。这个文件不进 git。
#
#    2026-09-07 起：口令类（DB_PASSWORD / JWT_SECRET / REDIS_PASSWORD / STORAGE_S3_*）
#    的真源是 GitHub Secrets，每次部署由 deploy/devbox/apply-env.sh 覆盖进来 ——
#    下面这些占位符不用手填，第一次部署就会被写上。
#    DevBox 删了重建也不丢：跑一次本脚本 + 点一次部署，配置全回来。
#
#    地址类（DB_URL / REDIS_HOST …）可以手填，也可以配成 GitHub Variables 由部署覆盖。
#    直接改这个文件的项，下次部署时若 GitHub 上有同名配置会被覆盖回去。

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

# ---------- JVM ----------
# ★ 50% 而不是 70%：这台 DevBox 既跑应用又跑构建，只有 4 GiB。
#   构建时 Maven 要 ~1 GB、npm 要 ~1 GB，而应用还开着。
#   给应用留 2 GB 上限（这个应用远用不到），剩下的留给构建。
#   超了会被 OOMKilled —— 容器无日志重启，最难查的一类问题。
# MaxRAMPercentage 而不是写死 -Xmx：换规格时不用改这里。
#
# ★★ 引号不能省 —— 值里有空格。
#    deploy.sh 用 `set -a; . .env` 加载本文件，那是 shell 求值不是 ini 解析：
#    不加引号时 bash 只把第一段当赋值，后面几段当【命令】执行，报
#    "-XX:+ExitOnOutOfMemoryError: command not found"，
#    而 set -e 会让整个部署在这里直接中止。
#    更隐蔽的是即使没有 set -e，JAVA_OPTS 也只剩第一个参数，
#    堆上限配置静默丢失。凡是值里可能有空格的，一律加引号。
JAVA_OPTS="-XX:MaxRAMPercentage=50 -XX:+ExitOnOutOfMemoryError -Duser.timezone=Asia/Shanghai"

# ---------- 部署 ----------
# 健康检查等待上限（秒）。★ 迁移在端口打开【之前】执行，
# 所以带大迁移的那次发布要先把这个值调大，否则会被误判成启动失败而触发回滚。
HEALTH_TIMEOUT=120
ENVEOF
    chmod 600 "$APP_DIR/.env"
    log "created $APP_DIR/.env  ← ★ 现在去把里面的占位符填掉"
else
    log ".env already exists, leaving it alone"
fi

# ---------- 5. 安装 entrypoint.sh ----------
# ★ 这个文件是【发布成应用镜像后】的容器入口，也是多副本时的启动脚本。
#   正本在仓库里（deploy/devbox/entrypoint.sh），这里只负责安装。
#
# ★★ 它【不会】在 DevBox 开发容器里执行 —— 2026-11-01 实测：
#      文件能正常装到 /home/devbox/project/，权限对、内容对，
#      但 DevBox 重启后 ss/ps 都看不到应用，公网返回 111。两次重启都一样。
#      Sealos 文档对这个文件的定义是「应用【在发布后】的启动方式」，
#      只有「发布版本 → 部署应用」产出的镜像才把它当 ENTRYPOINT。
#    所以：DevBox 重启后应用不会自启，需要重跑一次 Action 或手动拉起。
#    生产请用「应用管理」跑镜像，那里才有副本管理和自动重启。
ENTRYPOINT=/home/devbox/project/entrypoint.sh
mkdir -p "$(dirname "$ENTRYPOINT")"
# ★ 以前是内联生成 + 「已存在就不覆盖」，导致改了永远同步不过来、只能上机器手改。
#   现在每次部署由 deploy.sh 重新安装，改文件 → 点 Action 就生效。
if [ -f "$SRC_DIR/deploy/devbox/entrypoint.sh" ]; then
    install -m 0755 "$SRC_DIR/deploy/devbox/entrypoint.sh" "$ENTRYPOINT"
    log "installed $ENTRYPOINT (from repo)"
else
    # bootstrap 常常是单独 scp 过来先跑的，那时还没有源码 —— 交给首次部署安装。
    log "source not synced yet; deploy.sh will install $ENTRYPOINT on the first deploy"
fi

log ""
log "完成。接下来："
log "  1. 编辑 $APP_DIR/.env，填数据库口令和 JWT_SECRET"
log "  2. 在 GitHub 上点 Actions → Deploy to Sealos DevBox → Run workflow"
log ""
log "手动构建部署（不经过 GitHub）——★ build.sh 不自己同步源码，要先拉："
log "  cd $SRC_DIR && git fetch --depth 1 origin main && git reset --hard origin/main"
log "  bash $SRC_DIR/deploy/devbox/build.sh"
