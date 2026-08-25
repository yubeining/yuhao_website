# 变更记录 —— 报价工作台

## 新增

```
portal/src/mock/ai.ts                     AI 估价（模拟实现，文档 8 §5 契约）
portal/src/pages/ops/QuoteWorkPage.tsx    报价工作台 /ops/quotes/:orderId
changelog/2026-08-26_quote-workbench/     本文件夹
```

## 修改

| 文件 | 改动 | 原因 |
|---|---|---|
| `mock/types.ts` | `OrderPart` 加 `base` / `baseSrc` / `baseAt` / `ai` | 基准成本成为定价唯一输入，来源必须能分清 |
| `mock/types.ts` | `QuoteItem` 加 `base` / `baseSrc` | 毛利按当时成本算，来源跟着单据走（C2） |
| `mock/params.ts` | `custUnit` / `supTarget` 改收 `base`，不再查材料表 | 查表算价等于绕开「这个价是谁定的」 |
| `mock/params.ts` | `pricingBlockers` 签名去掉 rates，改报「零件没有基准成本」 | 卡住的原因从材料级变成零件级，更接近运营要做的动作 |
| `mock/actions.ts` | 新增 `runAi` / `setBase` / `autoQuotable` | 两条定价路径 + 自动出单的判据 |
| `mock/actions.ts` | `updatePart`：材料或图纸变了就作废基准成本和 AI 结果 | 成本是按材料估的，换了材料还留着旧价，那个价的来源已经不存在了 |
| `mock/MockProvider.tsx` | 估价工人一跳做两件事：跑 AI、判断能否自动出单 | 沾了人工定价的单子不抢在运营前面发出去 |
| `pages/ops/QuotesPage.tsx` | 待出价可点进工作台；已出报价加「定价来源」列 | 一张单里两种来源都有很常见 |
| `router.tsx` | 注册 `/ops/quotes/:id` | — |

## 行为

```
客户提交订单
   ↓  5 秒（占位，表现「估价要时间」）
AI 估价：逐个零件出 base / range / confidence / similarSamples
   ├─ 置信度 ≥ 75%  → 落价，baseSrc = 'ai'
   └─ 置信度 < 75%  → 只留结果不落价，转人工（文档 8 §5、Q18）
                      材料没配基准成本 → 直接估不出来
   ↓
全部零件都是 AI 定的 → 自动出报价单
有任何一个是人工定的 → 停在待出价，运营在工作台按「生成报价单」
```

## 验证

前端类型检查 `npm run type-check` 通过；`npm run build` 通过。

浏览器实测（6 个零件，其中 1 个材料未配成本）：

| 场景 | 结果 |
|---|---|
| AI 估价 | 2 个采用、3 个置信度不足转人工、1 个材料无成本估不出 |
| 出单闸门 | 3 个零件未定价时按钮禁用，缺项写在按钮旁边 |
| 人工定价 | 逐行填入后写进 `base`，来源标为「人工定价」，带时间戳 |
| 不抢跑 | 人工填完最后一个价后等待 3 秒，单子仍停在待出价 |
| 生成报价单 | QT 出单，行来源 `ai,manual,ai,manual,manual,manual` |
| 全自动路径 | 只剩 AI 定价的零件时，运营停在列表页不动，单子自己出了报价 |
| 确定性 | 同一零件重复估价结果一致 |

## 遗留项

1. **AI 是模拟的。**`mock/ai.ts` 里没有模型，界面上有横幅明说。
   换真模型时只改这一个文件，上层不动。
2. **定价参数仍是演示种子**（见 `portal/src/mock/params.ts` 顶部注释），
   利润率 / 议价空间 / 汇率 / 账期 / 六个材料成本都是编的，对外报价不能用。
3. **文档 8 §4.2 的「一系列成本」（质检 / 包装 / 运费 / 出口 / 关税）没做。**
   当前对客价 = 基准成本 × (1 + 利润率) ÷ 汇率，中间少了这一层。
4. **文档 8 §4.3 的利润率按客户分档（A16 / B22 / C28）没做**，现在是全局一个值。
5. **报价单谢绝之后怎么走仍未定**，`Quote.status` 只有 open / accepted。
6. 1-requirement.md 末尾那三条「动作归谁」的默认值**等业务方确认**。
