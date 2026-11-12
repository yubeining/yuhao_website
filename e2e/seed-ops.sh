#!/usr/bin/env bash
# 造第一个运营账号 —— 系统里没有「第一个运营账号」的入口（运营不自助注册）。
#
# 和 scripts/ops-user-sql.sh 用的是同一套 SQL 形状（bcrypt hash、挂 INTERNAL 组织），
# 只是把它做成可脚本化：E2E 需要一个已知密码的运营账号才能跑。
#
# 用法：
#   bash e2e/seed-ops.sh                     # 默认 ops-e2e@example.com / password123
#   EMAIL=me@x.com PW=secret123 bash e2e/seed-ops.sh
#
# 需要的环境变量（都有默认值）：
#   PGHOST_CONTAINER  docker 容器名，默认 mfg-postgres-test
#   PGDATABASE        库名，默认 mfg_e2e
set -euo pipefail

EMAIL="${EMAIL:-ops-e2e@example.com}"
PW="${PW:-password123}"
CONTAINER="${PGHOST_CONTAINER:-mfg-postgres-test}"
DB="${PGDATABASE:-mfg_e2e}"

command -v htpasswd >/dev/null || { echo "htpasswd not found（macOS 自带；Debian 在 apache2-utils）" >&2; exit 1; }

# bcrypt cost 10，Spring 的 BCryptPasswordEncoder 认 $2y$；明文不进 SQL、不进进程参数
HASH="$(printf '%s' "$PW" | htpasswd -niBC 10 x | tr -d '\n')"
HASH="${HASH#x:}"

SQL="INSERT INTO organization (id, type, name)
     SELECT gen_random_uuid(), 'INTERNAL', 'E2E HQ'
     WHERE NOT EXISTS (SELECT 1 FROM organization WHERE type = 'INTERNAL');
     INSERT INTO ops_user (id, org_id, email, password_hash, display_name)
     SELECT gen_random_uuid(),
            (SELECT id FROM organization WHERE type = 'INTERNAL' ORDER BY created_at LIMIT 1),
            '${EMAIL}', '${HASH}', 'E2E Ops'
     WHERE NOT EXISTS (SELECT 1 FROM ops_user WHERE email = '${EMAIL}');"

docker exec -i "$CONTAINER" psql -U mfg -d "$DB" -q -c "$SQL"
echo "运营账号就绪：$EMAIL（密码见 PW，默认 password123）"
