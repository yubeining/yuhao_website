# 变更记录 —— 报价列表默认全部（2026-11-15）

## 改动

| 文件 | 改动 |
|---|---|
| `ops/QuotesPage` | 默认 `ALL`；筛选项变成 `全部 / 待报价 / 待客户确认 / 已确认`；选「全部」时不传 status |
| `i18n` | 新增 `ops.quotes.filterAll`（中英） |

后端本来就把 `status` 当可选参数，不需要改。

## 验证（真跑）

```
默认进 /ops/quotes → filters = All | To quote | Awaiting customer | Confirmed
卡片头 = "All 2 orders"，表格 2 行（两张 SUBMITTED 单都列出来）
```

`type-check`、`build` 通过。
