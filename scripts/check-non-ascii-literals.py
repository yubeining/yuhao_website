#!/usr/bin/env python3
"""Java 非 ASCII 字符串字面量闸门。

backend/src/main/java/ 下【新增或修改】的行里，Java 字符串字面量不得含非 ASCII 字符。
注释可以写中文，字符串字面量不行。

为什么（见 CLAUDE.md §7 / C4）：
本系统是三语的（EN/DE 给欧洲客户、中文给供应商和内部）。
后端一旦把文案硬编码进业务逻辑，就永久绑死在一种语言上 ——
改个措辞要改 Java 代码、加一种语言要重写整块逻辑。
后端只返 i18n code，翻译全在前端。

diff-aware：只检查新增/修改的行，存量代码自动豁免。
这让本闸门可以在项目任何阶段引入，不用先还完债。

用法:
    check-non-ascii-literals.py              # 校验暂存区
    check-non-ascii-literals.py BASE HEAD    # 校验 diff（CI）
"""
import re
import subprocess
import sys

SCOPE = "backend/src/main/java/"
# 匹配 Java 字符串字面量（含转义），以及文本块的起始
STRING_LITERAL = re.compile(r'"(?:\\.|[^"\\])*"')
NON_ASCII = re.compile(r"[^\x00-\x7F]")


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


def is_block_comment_line(text):
    """判断这一行是不是块注释 / Javadoc 的一部分。

    ★ 为什么需要这个：本闸门是 diff-aware 的，拿到的是【孤立的一行】，
      没有上下文，无法知道它处于 /* ... */ 之内。

      Javadoc 里写中文是明确允许的（CLAUDE.md §7：注释可以写中文），
      而中文注释里用半角引号是家常便饭：

          * <p>本系统头号风险不是"某个用户越权改字段"，而是跨端泄露。

      不排除这类行，上面这句会被当成字符串字面量报错。
      闸门误杀的代价不是"多改一行" —— 是有人开始按 --no-verify，
      而那是 CLAUDE.md 里唯一一条"任何情况下都不能放松"的规则。

    判据是行首（去掉缩进后）是 * 或 /* 或 */。
    真正的 Java 字符串字面量不会出现在以 * 开头的行上，
    所以这个启发式几乎不会漏报。
    """
    stripped = text.lstrip()
    return stripped.startswith("*") or stripped.startswith("/*")


def strip_line_comment(text):
    """粗略去掉 // 之后的内容，但不能被字符串里的 // 骗到（如 URL）。"""
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
    findings = []
    for path, lineno, text in added_lines(sys.argv):
        if not path.startswith(SCOPE) or not path.endswith(".java"):
            continue
        if is_block_comment_line(text):
            continue
        code = strip_line_comment(text)
        for literal in STRING_LITERAL.findall(code):
            bad = NON_ASCII.findall(literal)
            if bad:
                findings.append((path, lineno, literal[:60], "".join(sorted(set(bad)))[:20]))

    if findings:
        print("\n✗ Java 代码里出现非 ASCII 字符串字面量\n", file=sys.stderr)
        for path, lineno, literal, chars in findings:
            print(f"  {path}:{lineno}", file=sys.stderr)
            print(f"    {literal}", file=sys.stderr)
            print(f"    含非 ASCII 字符: {chars}\n", file=sys.stderr)
        print("  后端只返 i18n code，不返文案 —— 翻译在前端。", file=sys.stderr)
        print("  错误消息 / 状态名 / 邮件模板 / 通知内容，全部 code 化。", file=sys.stderr)
        print("  注释可以写中文，字符串字面量不行。", file=sys.stderr)
        print("  规则见 CLAUDE.md > 7. 命名与文案\n", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
