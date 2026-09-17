#!/usr/bin/env bash
# 生成「建一个运营账号」的 SQL —— 系统里没有建运营账号的入口（运营不自助注册），第一个账号靠它建。
#
# 用法（在本机跑，不连任何库）：
#   scripts/ops-user-sql.sh > /tmp/ops-user.sql
# 按提示输入邮箱、显示名、密码（密码不回显，输两遍）。把输出的 SQL 贴到目标库执行
# （线上：Sealos 数据库 → 终端）。执行前先看一遍。
#
# 生成的 SQL：
#   * 只有 INSERT，没有 UPDATE / DELETE / DROP。
#   * 库里还没有 INTERNAL 组织时先建一个；已有就挂到最早建的那个上。
#   * 邮箱已存在则什么都不插（不会改已有账号的密码）。最后一条 SELECT 显示结果。
#   * 密码只以 bcrypt 哈希出现（cost 10，Spring 的 BCryptPasswordEncoder 认 $2y$）；明文不进 SQL、不进进程参数。
#   * 邮箱转小写 —— 登录时服务端会先 trim + 转小写再查（AuthService.normalize）。
#   * gen_random_uuid() 需要 PostgreSQL 13+。
#
# 依赖：htpasswd（macOS 自带；Debian 系在 apache2-utils 包里）。
set -euo pipefail

command -v htpasswd >/dev/null || { echo "htpasswd not found" >&2; exit 1; }

Q="'"
sql_quote() { printf "'%s'" "${1//$Q/$Q$Q}"; }

read -r -p "email: " email >&2
read -r -p "display name: " name >&2
read -r -p "internal org name (used only if none exists): " org >&2
read -r -s -p "password (min 8): " pw >&2; echo >&2
read -r -s -p "password again: " pw2 >&2; echo >&2

email="$(printf '%s' "$email" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')"
[[ "$email" == *@* ]] || { echo "invalid email" >&2; exit 1; }
[[ -n "$name" && -n "$org" ]] || { echo "display name and org name are required" >&2; exit 1; }
[[ "$pw" == "$pw2" ]] || { echo "passwords differ" >&2; exit 1; }
(( ${#pw} >= 8 )) || { echo "password too short" >&2; exit 1; }

# -i：密码从 stdin 读，不出现在进程参数里
hash="$(printf '%s' "$pw" | htpasswd -niBC 10 x | tr -d '\n')"
hash="${hash#x:}"
unset pw pw2
[[ "$hash" == \$2* ]] || { echo "bcrypt hash failed" >&2; exit 1; }

E="$(sql_quote "$email")"
cat <<SQL
BEGIN;

INSERT INTO organization (id, type, name)
SELECT gen_random_uuid(), 'INTERNAL', $(sql_quote "$org")
WHERE NOT EXISTS (SELECT 1 FROM organization WHERE type = 'INTERNAL');

INSERT INTO ops_user (id, org_id, email, password_hash, display_name)
SELECT gen_random_uuid(),
       (SELECT id FROM organization WHERE type = 'INTERNAL' ORDER BY created_at LIMIT 1),
       $E, $(sql_quote "$hash"), $(sql_quote "$name")
WHERE NOT EXISTS (SELECT 1 FROM ops_user WHERE email = $E);

SELECT u.email, u.display_name, u.status, o.name AS org_name, u.created_at
FROM ops_user u JOIN organization o ON o.id = u.org_id
WHERE u.email = $E;

COMMIT;
SQL
