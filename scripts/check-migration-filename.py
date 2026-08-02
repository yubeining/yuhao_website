#!/usr/bin/env python3
"""迁移文件名闸门。

对 database/migrations/ 下【新增或重命名】的文件校验两条规则：

  a. 文件名日期不得比今天（UTC）晚超过 1 天。
     YYYY-MM-DD 前缀是编写日期，用于确定执行顺序，未来日期会破坏顺序。
     留 1 天余量是为了容忍时区差（比如 UTC-7 的人晚上写代码，CI 在 UTC）。

  b. 新文件必须用 YYYY-MM-DD_NN_slug.sql，NN 是两位序号 01..99，
     且在【整个 migrations 目录】内同日唯一 —— 不只是本次提交的文件。
     只检查暂存的文件会漏掉「两个并行 PR 都用了 _01_」这种情况。

为什么要 NN：字典序里 '-'(0x2D) < '.'(0x2E)，
所以 `2026-08-02_foo-extra.sql` 会排在 `2026-08-02_foo.sql` 前面 —— 顺序反了。
两位序号消除这个歧义。

用法:
    check-migration-filename.py                 # 校验暂存区（pre-commit）
    check-migration-filename.py BASE HEAD       # 校验两个 commit 之间的 diff（CI）
"""
import datetime
import os
import re
import subprocess
import sys

MIGRATIONS_DIR = "database/migrations"
NN_FORM = re.compile(r"^(\d{4}-\d{2}-\d{2})_(\d{2})_[a-z0-9-]+\.sql$")
ANY_DATE = re.compile(r"^(\d{4}-\d{2}-\d{2})_")


def changed_files(argv):
    """返回新增/重命名到 migrations 目录的 .sql 文件（仓库相对路径）。"""
    if len(argv) >= 3:
        base, head = argv[1], argv[2]
        cmd = ["git", "diff", "--name-only", "--diff-filter=AR", base, head]
    else:
        cmd = ["git", "diff", "--cached", "--name-only", "--diff-filter=AR"]
    out = subprocess.run(cmd, capture_output=True, text=True, check=True).stdout
    return [
        p for p in out.splitlines()
        if p.startswith(MIGRATIONS_DIR + "/") and p.endswith(".sql")
    ]


def is_merge_commit():
    """合并提交跳过整个闸门。

    合并 main 时 git diff --cached 会把对方分支的全部迁移报成新增，
    否则每次合并都要重新校验整段历史。
    """
    return os.path.exists(os.path.join(".git", "MERGE_HEAD"))


def existing_ordinals():
    """扫描磁盘上所有迁移，返回 {日期: {序号: 文件名}}。"""
    index = {}
    if not os.path.isdir(MIGRATIONS_DIR):
        return index
    for name in os.listdir(MIGRATIONS_DIR):
        m = NN_FORM.match(name)
        if m:
            index.setdefault(m.group(1), {})[m.group(2)] = name
    return index


def main():
    if is_merge_commit():
        return 0

    files = changed_files(sys.argv)
    if not files:
        return 0

    today = datetime.datetime.now(datetime.timezone.utc).date()
    limit = today + datetime.timedelta(days=1)
    index = existing_ordinals()
    errors = []

    for path in files:
        name = os.path.basename(path)

        m = NN_FORM.match(name)
        if not m:
            d = ANY_DATE.match(name)
            hint = ""
            if d:
                hint = f"  建议改成 {d.group(1)}_01_<slug>.sql"
            errors.append(
                f"{name}\n"
                f"    文件名必须是 YYYY-MM-DD_NN_slug.sql（NN = 两位序号 01-99，slug 小写+短横线）"
                + (f"\n  {hint}" if hint else "")
            )
            continue

        date_str, nn = m.group(1), m.group(2)

        try:
            file_date = datetime.date.fromisoformat(date_str)
        except ValueError:
            errors.append(f"{name}\n    日期部分不是合法日期")
            continue

        if file_date > limit:
            errors.append(
                f"{name}\n"
                f"    文件名日期 {date_str} 超前于今天（UTC {today}）。"
                f"日期应为编写日期。"
            )

        if nn == "00" or not ("01" <= nn <= "99"):
            errors.append(f"{name}\n    序号必须在 01-99 之间，收到 {nn}")
            continue

        clash = index.get(date_str, {}).get(nn)
        if clash and clash != name:
            errors.append(
                f"{name}\n"
                f"    序号 {nn} 在 {date_str} 已被 {clash} 占用。"
                f"改成下一个可用序号。"
            )

        # 同一次提交里也不能重复
        index.setdefault(date_str, {})[nn] = name

    if errors:
        print("\n✗ 迁移文件名闸门未通过\n", file=sys.stderr)
        for e in errors:
            print(f"  {e}\n", file=sys.stderr)
        print("  规则见 CLAUDE.md > 6. 数据库 > 迁移\n", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
