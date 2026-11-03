#!/usr/bin/env python3
"""检查前端页面里有没有写死的中文字面量。

为什么需要这道闸门
------------------
文案抽成 key 这件事，最怕的不是"没做完"，而是"做完了又长回来"。
一个人写页面时随手 `<h1>我的订单</h1>`，代码能跑、review 也不一定看得出来，
三个月后没人说得清哪些页面翻过、哪些没翻。

策略：棘轮（只减不增）
----------------------
存量文件列在 scripts/i18n-allowlist.txt 里，先放过；
新文件、或已迁移完的文件再出现中文，直接失败。
每迁移完一个文件，就从白名单删一行。

用法
----
    python3 scripts/check-i18n-literals.py           # 检查（CI / pre-commit）
    python3 scripts/check-i18n-literals.py --init    # 按当前状态重写白名单
    python3 scripts/check-i18n-literals.py --list    # 只列出违规，不判失败
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SRC = REPO / "portal" / "src"
ALLOWLIST = REPO / "scripts" / "i18n-allowlist.txt"

# 这些目录本来就该有中文：
#   i18n/   → 文案字典本身
#   mock/   → 待拆除的原型层，不值得为它翻译
EXEMPT_DIRS = {"i18n", "mock"}

CJK = re.compile(r"[\u4e00-\u9fff]")


def strip_comments(line: str, in_block: bool) -> tuple[str, bool]:
    """去掉行注释和块注释，返回 (可执行部分, 是否仍在块注释里)。"""
    out = []
    i = 0
    while i < len(line):
        if in_block:
            end = line.find("*/", i)
            if end == -1:
                return "".join(out), True
            in_block = False
            i = end + 2
            continue
        start = line.find("/*", i)
        slash = line.find("//", i)
        # `://` 是 URL，不是注释
        while slash != -1 and slash > 0 and line[slash - 1] == ":":
            slash = line.find("//", slash + 1)
        if start == -1 and slash == -1:
            out.append(line[i:])
            break
        if start != -1 and (slash == -1 or start < slash):
            out.append(line[i:start])
            in_block = True
            i = start + 2
        else:
            out.append(line[i:slash])
            break
    return "".join(out), in_block


def scan_file(path: Path) -> list[tuple[int, str]]:
    hits: list[tuple[int, str]] = []
    in_block = False
    exempt = False
    for no, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        # 豁免标记：
        #   i18n-exempt-start / -end  包一段（如品牌名、语言名这种多行块）
        #   i18n-exempt               只豁免本行
        if "i18n-exempt-start" in raw:
            exempt = True
            continue
        if "i18n-exempt-end" in raw:
            exempt = False
            continue
        if exempt or "i18n-exempt" in raw:
            continue
        code, in_block = strip_comments(raw, in_block)
        if CJK.search(code):
            hits.append((no, raw.strip()))
    return hits


def iter_sources():
    for ext in ("*.tsx", "*.ts"):
        for path in SRC.rglob(ext):
            rel = path.relative_to(SRC)
            if rel.parts[0] in EXEMPT_DIRS:
                continue
            if path.name.endswith(".d.ts"):
                continue
            yield path, rel


def read_allowlist() -> set[str]:
    if not ALLOWLIST.exists():
        return set()
    return {
        line.strip()
        for line in ALLOWLIST.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.startswith("#")
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--init", action="store_true", help="按当前状态重写白名单")
    ap.add_argument("--list", action="store_true", help="只列出违规，不返回失败")
    args = ap.parse_args()

    offenders: dict[str, list[tuple[int, str]]] = {}
    for path, rel in iter_sources():
        hits = scan_file(path)
        if hits:
            offenders[str(rel)] = hits

    if args.init:
        lines = [
            "# 还没迁移的页面。每迁移完一个文件就删掉一行 —— 只减不增。",
            "# 由 scripts/check-i18n-literals.py --init 生成。",
            "",
        ]
        lines += sorted(offenders)
        ALLOWLIST.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"已写入 {ALLOWLIST.relative_to(REPO)}：{len(offenders)} 个文件")
        return 0

    allowed = read_allowlist()
    bad = {f: hits for f, hits in offenders.items() if f not in allowed}

    if not bad:
        print(f"✓ 没有新增写死的中文（白名单内还有 {len(allowed)} 个文件待迁移）")
        return 0

    print("✗ 发现写死的中文字面量：\n", file=sys.stderr)
    for f in sorted(bad):
        for no, text in bad[f][:5]:
            print(f"  {f}:{no}: {text}", file=sys.stderr)
        if len(bad[f]) > 5:
            print(f"  {f}: …还有 {len(bad[f]) - 5} 行", file=sys.stderr)
    print(
        "\n处理方式：把文案抽到 portal/src/i18n/strings.ts（zh / en 各一份），"
        "页面里改用 t.xxx。\n"
        "术语查 docs/i18n/glossary.md。确实暂不迁移的文件，加进 scripts/i18n-allowlist.txt。",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
