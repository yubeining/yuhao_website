#!/usr/bin/env python3
"""遗留合并冲突标记闸门 —— 扫描【任何文件】的新增行。

javac / tsc 会在编译时抓到源码里的冲突标记，
但 CI 里没有任何东西会解析 database/schema.sql、*.md、*.yml ——
一个漏掉的 >>>>>>> 能一直活到某天有人用 psql 重建库时才炸。

用法:
    check-conflict-markers.py              # 校验暂存区
    check-conflict-markers.py BASE HEAD    # 校验 diff（CI）
"""
import re
import subprocess
import sys

MARKER = re.compile(r"^(<{7}|={7}|>{7})(\s|$)")


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


def main():
    findings = [
        (p, n, t) for p, n, t in added_lines(sys.argv)
        if MARKER.match(t) and not p.endswith("check-conflict-markers.py")
    ]

    if findings:
        print("\n✗ 检测到遗留的合并冲突标记\n", file=sys.stderr)
        for path, lineno, text in findings:
            print(f"  {path}:{lineno}  {text.strip()[:80]}", file=sys.stderr)
        print("\n  解决完冲突后请删掉 <<<<<<< / ======= / >>>>>>> 标记行。\n", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
