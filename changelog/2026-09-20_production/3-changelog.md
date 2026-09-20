# 变更记录 —— 第 6 步：生产进度 + 质检（2026-09-20）

## 做了什么

一张已签字的供应商订单现在能一路走到「零件全部质检合格」，客户端跟着看到进度。

**供应商**：每行「开工」「完工」（只有这两个动作，不报件数）→ 全部完工后「发给平台」。
**运营**：新页「生产与质检」，对到平台的行填 合格 / 返工 / 报废（三个数之和 = 该行件数）；
报废件能点「原厂重做」补一行。
**客户**：订单详情多一列「进度」（待安排 / 进行中 / 已完成），全部合格后订单变「已完工 · 待发货」。

## 数据库

`database/migrations/2026-09-20_02_production.sql`（不加表）：

- `supplier_order_part`：加 `fulfillment_status`（8 态）、`superseded_by` / `replaces_part_id`（溯源两头）、
  `started_at` / `produced_at` / `shipped_at` / `qc_decided_at`；三条 CHECK（取值、时间线、被替代必须指向新行）；
  三个索引（`(supplier_order_id, fulfillment_status)` + 两个溯源列，无外键所以必须自己建）。
- `customer_order_part`：加 `fulfillment_status`（折叠四态）+ CHECK。
- 状态枚举加值（对旧 jar 安全）：`supplier_order` 加 `IN_PRODUCTION` / `SHIPPED` / `FULFILLED`；
  `ops_order` 加 `FULFILLED`；`customer_order` 加 `READY`。`supplier_order_contract_chk` 同步放宽到新的三个状态。

`database/schema.sql` 用 `scripts/dump-schema.sh` 重新生成（26 张表含账本，外键 0）。

## 后端（都在 `domain/order`，不跨域、不发事件）

| 文件 | 干什么 |
|---|---|
| `ProductionService`（新） | 开工 / 完工 / 发货 / 质检 / 原厂重做 + 三层回写 |
| `SupplierProductionController`（新） | `POST /supplier/orders/{id}/lines/{lineId}/start`、`/produced`、`POST /supplier/orders/{id}/ship` |
| `OpsProductionController`（新） | `GET /ops/production`、`POST /ops/supplier-orders/{id}/lines/{lineId}/qc`、`/remake` |
| `SupplierOrderViews`（新） | 供应商视图 / 运营视图集中一处（原来在 `SupplierOfferService` 里私有） |
| `SupplierOrderPart` | 加状态机、拆行工厂 `splitFrom`、溯源两头 |
| `SupplierOrder` / `OpsOrder` / `CustomerOrder` | 加状态值；`isSigned()` 现在含生产中 / 已发 / 已完成（签了就锁定这条规则不变） |
| `CustomerOrderPart` / `OrderLineView` | 折叠四态 + 透出给客户 |
| `DispatchViews` / `DispatchLineDetails` | 行上加 `status` / `replacesPartId` / `supersededBy`（派单池和生产订单的行没有，字段不出现） |

回写链：叶子行 → 供应商订单（CONTRACTED / IN_PRODUCTION / SHIPPED / FULFILLED）→ 生产订单（ASSIGNED / FULFILLED）
→ 客户零件行（四态）→ 客户订单（CONFIRMED → READY），全在同一个事务里。

并发：每个写操作先 `FOR UPDATE` 锁生产订单（和接单 / 签字同一把锁、同一个顺序），锁住后重读零件行判状态。

## 前端

- `pages/ops/ProductionPage.tsx`（新）+ 路由 `/ops/production` + 左侧导航「生产与质检」。
- `pages/supplier/OrdersPage.tsx`：每行进度药丸 + 开工 / 完工按钮；整单「发给平台」（没全完工时不出现，并写明还差几行）。
- `pages/customer/OrderDetailPage.tsx`：确认报价之后多一列「进度」。
- `services/ops/production.ts`（新，已在 `services/index.ts` 加 `export *`）；行状态 `LineStatus` 只定义一处
  （`services/supplier/offers.ts`），运营 service 引用它。
- 状态文案：`pages/ops/dispatchStatus.ts` 加 `LINE_ST`、补 `SUPPLIER_ORDER_ST` / `OPS_ORDER_ST`；
  `pages/customer/status.ts` 加 `LINE_FULFILL_ST` 和 `READY`；`i18n/strings.ts` 加 9 条 `production.*` 错误文案。

## 验证（都实际跑过）

| 命令 | 结果 |
|---|---|
| 从零建库（临时 `postgres:16` 容器按序跑全部迁移） | 全部成功，exit 0 |
| `mvn verify`（含全部 IT，真 PG + 真 Redis） | 单测 78 通过，IT 129 通过 / 5 跳过，BUILD SUCCESS |
| `ProductionFlowIT` | 7 个用例全过：全流程、部分返工 + 报废 + 重做、全返工、守卫、越权、客户端隐私、并发 5 轮 |
| `npm run type-check` / `npm run build` | 通过 |

## 部署清单

1. 拉代码，GitHub Action 部署（迁移开机自动应用，只加列和枚举值，不需要停机）。
2. 线上走一遍：供应商开工 → 完工 → 发给平台 → 运营质检（试一次部分返工 + 报废 + 原厂重做）→ 全部合格 → 客户端看到「待发货」。

## 遗留（本轮知情不做）

- 发给客户（物流单号、客户确认收货）、换一家做（RESOURCE）和差价扣款、报废赔付 / 结算、通知。
- 质检**只记数，不记原因、不传报告** —— 质检报告 / 材质证明见文档 12 §10，随发货那一轮做。
- `ops_order_part` 不存状态，和文档 12 §7 的表格不一致（已在文档里标注为实现时的取舍）。
- 单据编号仍用 id 前 8 位 —— 编号规则至今没定。
