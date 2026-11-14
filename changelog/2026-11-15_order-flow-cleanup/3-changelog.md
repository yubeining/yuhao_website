# 变更记录 —— 订单流程交互修正（2026-11-15）

## 功能

- 删掉 `/customer/orders/new` 中间页；列表页点「新建订单」直接 `POST` 建草稿并跳详情
- 详情页顶部只保留状态 + 「提交订单」；「添加零件」从顶部移除，只在空态 / 卡片底部各出现一次
- 「提交订单」常驻（草稿），禁用时文案说明原因：`先添加零件` / `还有 N 个零件缺图纸`
- 「名称 / 期望交货日期」失焦保存后显示「已保存」，2 秒自动消失
- 期望交期由「天数」改为**日期**（`wanted_date date`），前端用 `input[type=date]`，运营端按原值展示

## 数据变更

- 新增迁移 `2026-11-15_01_customer-order-wanted-date.sql`：`ALTER TABLE customer_order ADD COLUMN IF NOT EXISTS wanted_date date`
- 旧列 `wanted_lead_days` **暂不删除**：回滚到上一版 jar 时旧代码仍会写它；两个发布周期后再清
- `database/schema.sql` 已同步

## 影响文件

后端：`CustomerOrder` / `OrderView` / `OrderSummaryView` / `OpsOrderView` / `OpsOrderSummaryView` /
`CustomerOrderController` / `CustomerOrderService` / `OpsCustomerOrderService` + 迁移 + IT
前端：`OrderDetailPage`、`OrderListPage`、删除 `NewOrderPage`、`services/*/orders.ts`、
`ops/QuotesPage`、`ops/QuoteWorkPage`、`router`、`i18n`

## 验证（真跑）

```
点「新建订单」→ /customer/orders/<uuid>      ← 不再有中间页
submit buttons = 1  disabled = true           ← 顶部常驻，提示"先添加零件"
add-part entries = 1                          ← 不再重复
date inputs = 1
改日期失焦 → saved hint = 1，2 秒后 = 0
reload → persisted date = 2026-12-01
```

`mvn test` 85 通过（含 `CustomerOrderFlowIT` 的编译修正）、`type-check`、`build` 通过。

## 踩到的坑

「已保存」的 `useEffect` 最初写在 `if (!order) return` 之后，导致
"Rendered more hooks than during the previous render" —— hooks 必须在所有早返回之前。
Playwright 跑到详情页时直接白屏，才发现。

## 遗留项

- 旧列 `wanted_lead_days` 待两个发布周期后清理（需要新迁移）
- 期望交货日期目前不参与任何校验/计算，只是展示
