# 变更记录 —— 提交后的状态说明与报价通知（2026-11-15）

## 前端

| 位置 | 改动 |
|---|---|
| `OrderDetailPage` | 三段 banner 合成一条**状态条**：已提交 / 已报价（金额+交期+主按钮）/ 已确认 / 已完工；每态只给一个动作 |
| `OrderListPage` | 「已报价」行的操作位变成 `确认报价 ›`，直接进报价页 |
| `QuoteListPage` | 空态改为「还有 N 张订单在等运营报价」（按 SUBMITTED 计数） |
| `i18n` | 新增状态条与等待报价文案（中英） |

## 后端

| 文件 | 改动 |
|---|---|
| `QuoteService.send` | 报价发出后调 `notifications.notify(...)`（事务提交后异步发，失败只记日志） |
| `QuoteEmailTemplate` | 新增：`i18n/quote-email-<locale>.txt`，首行主题、其余正文，缺语言回退英文 |
| `resources/i18n/quote-email-zh.txt` / `-en.txt` | 中英文报价通知 |

收件人取该组织第一个 ACTIVE 成员 —— 目前没有「主联系人」概念，如实按现有数据来。

## 刻意没做的

| 没做 | 原因 |
|---|---|
| 4 步进度条 / 时间轴 | 与状态 pill 重复；且**生产开始、完工两个时间戳后端没有**，画出来是空壳 |
| 「通常 X 内报价」 | 业务没给时限，不编 |
| 报价有效期 | 该字段不存在（2026-09-17 明确不设） |
| 发货 / 签收 / 付款 | 业务待定，这期不做 |

## 验证（真跑）

```
提交后状态条 = "We are pricing your order. The quote will appear in \"My quotes\" for you to confirm. | My quotes →"
订单列表（状态改成 QUOTED）= "Confirm quote ›"
报价空态（有 1 张 SUBMITTED）= "No quotes yet | 1 order still waiting for a quote; it will appear here."
mvn test 92 通过（新增 QuoteEmailTemplateTest 2 个）
QuoteFlowIT 20 通过（带通知的真实发送路径）
```

## 遗留

- 邮件只在报价发出时发；客户确认/拒绝、订单完工都还没有通知
- 报价邮件没有落发送记录，失败只能从日志看
