#!/usr/bin/env python3
"""schema.sql 同步闸门（CLAUDE.md §5：改动同步反映到 database/schema.sql）。

规则：本次提交里【新增/修改了 database/migrations/*.sql】，就必须【同时改了 database/schema.sql】。
否则说明加了迁移却忘了重新生成快照（跑 scripts/dump-schema.sh）。

★ 只看文件是否一起变，不比对内容 —— 内容准不准由 dump-schema.sh 保证。
★ 合并提交跳过（合并 main 会把对方的迁移报成新增）。

用法:
    check-schema-sync.py                 # 暂存区（pre-commit）
    check-schema-sync.py BASE HEAD       # 两个 commit 之间（CI）
"""
import os
import subprocess
import sys

SCHEMA = "database/schema.sql"
MIGRATIONS_DIR = "database/migrations"


def changed_files(argv):
    if len(argv) >= 3:
        cmd = ["git", "diff", "--name-only", "--diff-filter=ACMR", argv[1], argv[2]]
    else:
        cmd = ["git", "diff", "--cached", "--name-only", "--diff-filter=ACMR"]
    return subprocess.run(cmd, capture_output=True, text=True, check=True).stdout.splitlines()


def is_merge_commit():
    return os.path.exists(os.path.join(".git", "MERGE_HEAD"))


def main():
    if is_merge_commit():
        return 0
    files = changed_files(sys.argv)
    migration_changed = any(
        f.startswith(MIGRATIONS_DIR + "/") and f.endswith(".sql") for f in files)
    schema_changed = SCHEMA in files
    if migration_changed and not schema_changed:
        sys.stderr.write(
            "\n[check-schema-sync] 改了迁移却没更新 database/schema.sql（CLAUDE.md §5）。\n"
            "  迁移应用到本地库后跑：scripts/dump-schema.sh  然后把 database/schema.sql 一起提交。\n")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
