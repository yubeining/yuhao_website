# 订单收货地址 —— 变更记录

## 改动

- `database/migrations/2026-11-23_01_customer-order-ship-to.sql`：`customer_order` 加 `ship_to_*` 9 列；`schema.sql`、迁移 README 同步。
- `domain/order/ShipTo`（新）：地址视图记录。
- `domain/order/CustomerOrder`：地址字段、`replaceShipTo` / `getShipTo`（没填返回 null）。
- `domain/order/CustomerOrderService`：`updateShipTo`（加订单行锁，DRAFT～CONFIRMED 可改，校验 ISO 国家代码）；`submit` 缺地址拒绝。
- `domain/order/CustomerOrderController`：`ShipToRequest` + `PUT /customer/orders/{orderId}/ship-to`。
- `domain/order/{OrderView,OpsOrderView,OpsCustomerOrderService}`：详情带 `shipTo`。供应商侧视图没动。
- 前端：`components/ShipToCard.tsx`（只读卡片，客户 / 运营共用）、`pages/customer/ShipToEditor.tsx`（编辑弹框）、
  `OrderDetailPage`（提交前提示、卡片）、`ops/QuoteWorkPage`（只读卡片）、`services` 类型与 `updateShipTo`、`strings.ts`。
- 测试：`CustomerOrderFlowIT` 新增 4 个用例 + 租户隔离断言；`QuoteFlowIT` 断言运营可见；`DispatchFlowIT` 断言供应商派单详情不含地址；
  其他会提交订单的 IT 在提交前补地址。

## 验证

- `mvn verify -Dit.test=CustomerOrderFlowIT,QuoteFlowIT,DispatchFlowIT,ProductionFlowIT,ContractFlowIT`：74 个用例全过。
- 本地空库启动：27 个迁移从零建库成功，`ddl-auto: validate` 通过。
- 浏览器（本地）：客户填写 / 校验 / 编辑 / READY 只读、运营只读卡片均实测。
- `npm run build` 通过。

## 已知代价 / 遗留

- **存量订单没有地址**：已提交的老订单 `shipTo` 为空，客户在 READY 前可以补；已就绪的老订单补不了，需要运营线下处理。
- 状态在 READY 之后客户不能改；运营端没有改地址的入口（需求没提）。
- 邮编、州/省不按国家校验；没有地址簿；没有清关税号。

## 部署清单

- 一个迁移（只加可空列），无新增环境变量。
