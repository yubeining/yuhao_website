#!/usr/bin/env bash
# 把 GitHub Secrets / Variables 覆盖进 DevBox 的 .env。
#
# 由 deploy.yml 的「写入配置」一步通过 ssh 调用，stdin 每行一项：
#     KEY<TAB>base64(value)
#
# ★ 为什么走 stdin + base64 而不是命令行参数：
#   参数会进 ps、进 shell 历史、进 Actions 的命令回显；stdin 三处都不进。
#   base64 只是为了让值里的换行 / 引号 / 空格安全过传输，不是加密。
#
# ★ 只覆盖收到的 key，其余行原样保留 —— 所以 GitHub 上没配的项
#   （比如 JAVA_OPTS、HEALTH_TIMEOUT）不会被抹掉。
#
# ★ 覆盖前先把旧 .env 备份成 .env.prev。deploy.sh 回滚时一并还原 ——
#   否则口令填错一个，新版起不来、回滚的旧版也起不来（同一个错口令）。
set -euo pipefail

APP_DIR="${APP_DIR:-/home/devbox/app}"
ENV_FILE="$APP_DIR/.env"

[ -f "$ENV_FILE" ] || { echo "FATAL: $ENV_FILE not found. Run bootstrap.sh first." >&2; exit 1; }

cp -f "$ENV_FILE" "$ENV_FILE.prev"
tmp="$(mktemp "$APP_DIR/.env.XXXXXX")"
cp -f "$ENV_FILE" "$tmp"

count=0
while IFS=$'\t' read -r key b64; do
    [ -n "$key" ] || continue
    [[ "$key" =~ ^[A-Z0-9_]+$ ]] || { echo "FATAL: refusing key '$key'" >&2; exit 1; }
    value="$(printf '%s' "$b64" | base64 -d)"

    # 值一律加双引号并转义 " \ $ ` —— deploy.sh 用 `set -a; . .env` 加载，
    # 那是 shell 求值：不转义的话口令里一个 $ 就会被当变量展开。
    esc="${value//\\/\\\\}"
    esc="${esc//\"/\\\"}"
    esc="${esc//\$/\\\$}"
    esc="${esc//\`/\\\`}"
    line="$key=\"$esc\""

    if grep -q "^${key}=" "$tmp"; then
        # 通过 ENVIRON 传给 awk，不用 -v：-v 会把值里的反斜杠当转义序列处理。
        K="$key" L="$line" awk 'index($0, ENVIRON["K"] "=") == 1 { print ENVIRON["L"]; next } { print }' \
            "$tmp" >"$tmp.new"
        mv -f "$tmp.new" "$tmp"
    else
        printf '\n%s\n' "$line" >>"$tmp"
    fi
    count=$((count + 1))
done

chmod 600 "$tmp"
mv -f "$tmp" "$ENV_FILE"
echo "[apply-env] $count key(s) written to $ENV_FILE (previous copy kept as .env.prev)"
