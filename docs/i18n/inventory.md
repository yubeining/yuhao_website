# 文案迁移清单

> 目的：知道**还剩多少、卡在哪个文件**。抽完一个文件，把它的行数从"未迁移"挪到"已迁移"。
>
> 统计口径：含中文**且非注释**的行（注释里的中文不上屏，不算）。
> 生成命令：`grep -rh "[一-龥]" --include=*.tsx pages components | grep -vE "^\s*(//|\*|/\*)" | wc -l`

## 总量

**585 行**，33 个文件。**已全部抽完**，仅 `components/PortalProbe.tsx`（开发探针）不译。

## 按端分批

| 批次 | 目录 | 行数 | 文件 | 状态 |
|---|---|---|---|---|
| 1 | `pages/auth` + `components` | 123 | 11 | ✅ 完成（PortalProbe 是开发探针，不译） |
| 2 | `pages/customer` | 135 | 6 | ✅ 完成 |
| 3 | `pages/supplier` | 89 | 6 | ✅ 完成 |
| 4 | `pages/ops` | 225 | 9 | ✅ 完成 |
| — | `SettingsPage` / `NotFoundPage` / `OnboardShell` | 14 | 3 | ✅ 完成 |

> 顺序理由：auth + components 是所有页面共用的壳（按钮、空态、错误提示），
> 先抽它们，后面每页的 key 才能复用；ops 最大且只有内部人看，放最后。

## 逐文件明细

| 文件 | 行数 | 状态 |
|---|---|---|
| `components/AppShell.tsx` | 34 | ✅ 已完成（导航按端分组 `t.nav.*`） |
| `components/ui.tsx` | 4 | ✅ 已完成（`t.common.*`） |
| `components/form.tsx` | 6 | ✅ 已完成（单位、增减按钮 aria-label） |
| `components/brand.tsx` | 7 | ✅ 已完成（品牌名豁免，不译） |
| `components/PortalProbe.tsx` | 5 | ⏸ 不译（开发探针，不挂在任何路由上，用户看不到） |
| `components/LangButton.tsx` | 2 | ✅ 已完成（endonym，整块豁免） |
| `pages/auth/SignInPage.tsx` | 24 | ✅ 已完成（含两步验证码登录） |
| `pages/auth/RegisterPage.tsx` | 7 | ✅ 已完成 |
| `pages/auth/InvitePage.tsx` | 24 | ✅ 已完成 |
| `pages/auth/OpsSignInPage.tsx` | 9 | ✅ 已完成 |
| `pages/SettingsPage.tsx` | — | 未开始 |
| `pages/NotFoundPage.tsx` | — | 未开始 |
| `pages/customer/*`（6 个） | 135 | 未开始 |
| `pages/supplier/*`（6 个） | 89 | 未开始 |
| `pages/ops/*`（9 个） | 225 | 未开始 |

> 具体行数用上面的 grep 现算，不在这里写死 —— 写了就会过期。

## 迁移一个文件的标准动作

1. 把中文抄进 `portal/src/i18n/strings.ts`，`zh` 和 `en` **各一份**（只写一份 TS 会报错）
2. 英文查 [`glossary.md`](./glossary.md)；查不到先补术语表
3. 页面里改成 `t.xxx`
4. 从 `scripts/i18n-allowlist.txt` 删掉这个文件
5. `python3 scripts/check-i18n-literals.py` 通过

## 豁免机制

极少数中文是**刻意的**，不翻译：

| 场景 | 例子 | 方式 |
|---|---|---|
| 品牌名 | `融一智造` | 块标记 |
| 语言名（endonym） | `中` / `EN` / `切换为中文` | 块标记 |

用法：在代码里包一段

```tsx
// i18n-exempt-start: 为什么这一块不译
...
// i18n-exempt-end
```

闸门会跳过这一段。**只豁免真正不该译的东西**，别拿它当偷懒的后门。

## 已知的坑

- **状态词对不上**：前端 `pages/customer/status.ts` 有 10 个状态词，后端只有 6 个枚举。
  翻译前先对齐，否则会把原型词汇翻成"看起来正式"的英文，反而是错的。
- **后端错误码**：已经在 `i18n/errorText.ts` 里有一层映射，不要另开一套。
- **动态拼接**：`\`共 ${n} 单\`` 这类不能硬翻，要拆成 `t.xxx.count` + 参数。
