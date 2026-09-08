#!/usr/bin/env python3
"""禁止数据库外键闸门（CLAUDE.md §4）。

对 database/migrations/ 下【新增/修改的行】里出现的外键约束直接拒：
  - REFERENCES
  - FOREIGN KEY
  - ON DELETE CASCADE / ON UPDATE CASCADE

为什么用外键是 bug（§4）：外键几乎不提供安全价值（归属校验本来就在 service 层做）、
和扩展-收缩冲突（加外键天然是破坏性变更）、ON DELETE CASCADE 是静默的大规模删除、
且诱导 JPA 关联（N+1 / LAZY 代理炸）。关联用裸 uuid 列 + 显式索引表达。

★ diff-aware：只卡新增/修改的行，存量欠债自动豁免 —— 08-02 骨架里的外键正在被
  2026-09-08_02_drop-all-foreign-keys.sql 清掉，它们的 CREATE 语句文本仍在旧文件里，
  但只要不改那些行就不会被这个闸门碰到。
★ 跳过 SQL 注释（-- 之后）：清理迁移的注释里会提到 "REFERENCES" 这个词，不能误报。

用法:
    check-no-foreign-keys.py                 # 校验暂存区（pre-commit）
    check-no-foreign-keys.py BASE HEAD       # 校验两个 commit 之间的 diff（CI）
"""
import os
import re
import subprocess
import sys

MIGRATIONS_DIR = "database/migrations"

# 大小写不敏感；\bREFERENCES\b 避免撞到别的词
FORBIDDEN = re.compile(r"\b(REFERENCES|FOREIGN\s+KEY)\b|\bON\s+(DELETE|UPDATE)\s+CASCADE\b",
                       re.IGNORECASE)


def added_lines(argv):
    if len(argv) >= 3:
        cmd = ["git", "diff", "--unified=0", argv[1], argv[2]]
    else:
        cmd = ["git", "diff", "--cached", "--unified=0"]
    diff = subprocess.run(cmd, capture_output=True, text=True, check=True).stdout

    results, path, lineno = [], None, 0
    for line in diff.splitlines():
        if line.startswith("+++ b/"):
            path = line[6:]
        elif line.startswith("@@"):
            m = re.search(r"\+(\d+)", line)
            lineno = int(m.group(1)) if m else 0
        elif line.startswith("+") and not line.startswith("+++"):
            if path:
                results.append((path, lineno, line[1:]))
            lineno += 1
    return results


def strip_sql_comment(text):
    """去掉 SQL 行注释（-- 之后），但不被字符串里的 -- 骗到。"""
    in_string = False
    for i, ch in enumerate(text):
        if ch == "'":
            in_string = not in_string
        elif ch == "-" and not in_string and i + 1 < len(text) and text[i + 1] == "-":
            return text[:i]
    return text


def is_merge_commit():
    return os.path.exists(os.path.join(".git", "MERGE_HEAD"))


def main():
    if is_merge_commit():
        return 0

    violations = []
    for path, lineno, text in added_lines(sys.argv):
        if not (path.startswith(MIGRATIONS_DIR + "/") and path.endswith(".sql")):
            continue
        code = strip_sql_comment(text)
        if FORBIDDEN.search(code):
            violations.append((path, lineno, text.strip()))

    if violations:
        sys.stderr.write("\n[check-no-foreign-keys] 迁移里禁止外键约束（CLAUDE.md §4）:\n")
        for path, lineno, text in violations:
            sys.stderr.write(f"  {path}:{lineno}: {text}\n")
        sys.stderr.write(
            "\n关联用裸 uuid 列 + 显式索引，完整性由 service 层带租户条件校验（§3 铁律 3）。\n"
            "删存量外键请写 DROP CONSTRAINT，不要在注释外出现 REFERENCES/FOREIGN KEY。\n")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
