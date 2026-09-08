#!/usr/bin/env bash
# 重新生成 database/schema.sql —— 迁移的当前形态快照（只读参考，不由它建库）。
#
# CLAUDE.md §5 要求"改动同步反映到 database/schema.sql"。手维护易漂移，所以改成【生成】：
# 每次加了迁移、本地库应用完之后，跑这个脚本把 schema.sql 重出一遍再提交。
#
# 用法（本地库已应用全部迁移的前提下）：
#   PGHOST=... PGPORT=... PGUSER=... PGDATABASE=mfg PGPASSWORD=... scripts/dump-schema.sh
# 或对 docker compose 的库：
#   docker exec mfg-postgres pg_dump -U mfg -d mfg --schema-only --no-owner --no-privileges | scripts/dump-schema.sh -
set -euo pipefail
OUT="database/schema.sql"

gen() {
    cat <<'HEADER'
-- database/schema.sql —— 迁移当前形态的快照，【只读参考】，不用它建库。
--
-- ★ 建库/改库只走 database/migrations/（开机自动应用）。本文件是把那些迁移应用完之后
--   pg_dump 出来的结果，方便看"现在 schema 长什么样"、code review 时对照。
-- ★ 不要手改本文件 —— 加了迁移、本地应用完之后跑 scripts/dump-schema.sh 重新生成再提交。
-- ★ 无外键（CLAUDE.md §4）；关联用裸 uuid + 显式索引。

HEADER
    # 去掉 pg_dump 的 psql 元命令(\restrict 等)和多余空行；去掉 public. schema 前缀噪音保留
    grep -vE '^\\(restrict|unrestrict)' | grep -vE '^--$' | cat -s
}

if [ "${1:-}" = "-" ]; then
    gen > "$OUT"
else
    pg_dump --schema-only --no-owner --no-privileges --no-comments | gen > "$OUT"
fi
echo "wrote $OUT ($(grep -c 'CREATE TABLE' "$OUT") tables, $(grep -c 'FOREIGN KEY\|REFERENCES' "$OUT") FKs)"
