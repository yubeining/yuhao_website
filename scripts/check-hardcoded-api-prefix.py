#!/usr/bin/env python3
"""禁止在 Java 代码里硬编码 API 前缀（CLAUDE.md §1 / §10 C5）。

全局前缀（/api/v1）走配置项 app.api.prefix，任何做路径匹配的地方都从配置推导。
代码里出现 "/api/v1" 字面量 = 埋雷：将来改前缀漏改一处就是线上 bug。

★ diff-aware：只查新增/改动行。★ 跳过注释（Javadoc/块注释/行注释里写 /api/v1 是文档，允许）。
★ 只查 backend 主代码的 .java。

用法:
    check-hardcoded-api-prefix.py                 # 暂存区（pre-commit）
    check-hardcoded-api-prefix.py BASE HEAD       # 两个 commit 之间（CI）
"""
import re
import subprocess
import sys

NEEDLE = "/api/v1"
JAVA_MAIN = "backend/src/main/java/"


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


def is_comment_line(text):
    """块注释 / Javadoc 行（以 * 或 /* 开头）。"""
    stripped = text.lstrip()
    return stripped.startswith("*") or stripped.startswith("/*")


def strip_line_comment(text):
    """去掉 // 之后的内容，不被字符串里的 // 骗到。"""
    in_string = False
    escaped = False
    for i, ch in enumerate(text):
        if escaped:
            escaped = False
            continue
        if ch == "\\":
            escaped = True
        elif ch == '"':
            in_string = not in_string
        elif ch == "/" and not in_string and i + 1 < len(text) and text[i + 1] == "/":
            return text[:i]
    return text


def main():
    violations = []
    for path, lineno, text in added_lines(sys.argv):
        if not (path.startswith(JAVA_MAIN) and path.endswith(".java")):
            continue
        if is_comment_line(text):
            continue
        code = strip_line_comment(text)
        if NEEDLE in code:
            violations.append((path, lineno, text.strip()))
    if violations:
        sys.stderr.write(
            "\n[check-hardcoded-api-prefix] Java 里禁止硬编码 \"/api/v1\"（CLAUDE.md §1）。\n"
            "  从 app.api.prefix 推导，别写死。注释里写它是允许的。\n")
        for path, lineno, text in violations:
            sys.stderr.write(f"  {path}:{lineno}: {text}\n")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
