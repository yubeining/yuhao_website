#!/usr/bin/env python3
"""CLAUDE.md 自检：业务词 / 项目类名 / 交叉引用 / 编号 / 格式。
用法：python3 scripts/check-claude-md.py    退出码 0 = 通过"""
import io, re, sys, pathlib

DOC = pathlib.Path(__file__).resolve().parent.parent / 'CLAUDE.md'
BIZ = r'供应商|客户|报价|订单|单据|图纸|采购|质检|物流|定价|欧洲|party|CUSTOMER|SUPPLIER|OPERATOR'
CLS = r'`([A-Z][A-Za-z]*(?:Interceptor|Registry|Runner|Controller|Service|Principal|Keys|Guard|View))`'
ALLOW_CLS = {'XxxView'}          # 命名约定占位符，不是真类名

def main():
    s = io.open(DOC, encoding='utf-8').read()
    L = s.split('\n')
    bad = []

    for i, l in enumerate(L, 1):
        if re.search(BIZ, l):
            bad.append(f'{i}: 业务词/角色枚举 — {l.strip()[:70]}')

    for c in sorted(set(re.findall(CLS, s)) - ALLOW_CLS):
        bad.append(f'项目类名泄漏 — `{c}`（只描述职责，不点名类）')

    secs = re.findall(r'^## (\d+)\.', s, re.M)
    if secs != [str(i) for i in range(1, len(secs) + 1)]:
        bad.append(f'章节编号不连续 — {secs}')
    for r in sorted(set(re.findall(r'§(\d+)', s)) - set(secs)):
        bad.append(f'悬空引用 — §{r} 不存在')

    cs = re.findall(r'^### C(\d+) ', s, re.M)
    if cs != [str(i) for i in range(1, len(cs) + 1)]:
        bad.append(f'C 编号不连续 — {cs}')
    for r in sorted(set(re.findall(r'C(\d+)', s)) - set(cs)):
        bad.append(f'悬空引用 — C{r} 不存在')

    bad += [f'{i+1}: 连续空行' for i in range(1, len(L)) if L[i] == '' and L[i-1] == '']
    bad += [f'{i+1}: 空标题 — {L[i]}' for i in range(len(L)-2)
            if L[i].startswith('###') and L[i+2].startswith('#')]

    # 直引号只允许出现在代码块 / 行内代码里
    infence = False
    for i, l in enumerate(L, 1):
        if l.startswith('```'): infence = not infence; continue
        if infence: continue
        if '"' in re.sub(r'`[^`]*`', '', l):
            bad.append(f'{i}: 正文用了直引号，应改「」 — {l.strip()[:60]}')

    if bad:
        print(f'CLAUDE.md 自检未通过（{len(bad)} 项）:')
        for b in bad: print('  ✗', b)
        return 1
    print(f'CLAUDE.md 自检通过（{len(L)} 行）')
    return 0

sys.exit(main())
