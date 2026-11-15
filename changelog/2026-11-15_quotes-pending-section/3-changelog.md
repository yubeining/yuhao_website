# 变更记录 —— 我的报价加「待报价」区块（2026-11-15）

## 改动

| 文件 | 改动 |
|---|---|
| `QuoteListPage` | 拉一次订单列表，筛出 `SUBMITTED` 作为「待报价」；与「报价」同卡两段 |
| `styles.css` | `.qsec` / `.qrow-wait` |
| `i18n` | `pendingSection` / `quoteSection` / `awaiting`；去掉只用于空态的 `waitingForQuote` |

## 验证（真跑，含混合场景）

```
只有等待：sections = "Awaiting quote 2"；行 = "Untitled order Awaiting quotation ›" ×2
混合：   sections = "Awaiting quote 1 | Quotes 1"
        quote row = "Untitled order € 12,340.00 Locked (FX date 2026-11-15) 30 days after confirmation … Confirmed"
```

（混合场景的报价行是直接插库造的测试数据，只为验证渲染与分段；金额/汇率日期都按已有字段显示。）

`type-check`、`build` 通过。

## 遗留

- 「待报价」行点了跳订单详情，没有直接跳报价（报价还不存在）
- 分段标题的计数目前是「段内条数」，以后要加筛选时注意同步
