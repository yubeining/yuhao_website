# 实施计划（2026-11-24 需求方批准）

## 数据库（`2026-11-24_01_shipping.sql`，只加不删，一次发布）
- `customer_order` 加 `shipment_carrier` / `shipment_tracking_no` / `shipped_at` / `shipped_by_ops_user_id` / `received_at`，状态加 `SHIPPED` / `COMPLETED`。整单只发一次，所以放订单上。
- 新表 `supplier_shipment`（每次发给平台一条）；`supplier_order_part.supplier_shipment_id` 记这一行哪一批发出。
- 新表 `customer_order_document`（随货文件）+ `customer_order_document_access_log`（下载审计）。
- 全部归 `domain/order`，裸 uuid + 索引，无外键。

## 后端
- 供应商 `POST /supplier/orders/{id}/ship` 必须带 `{carrier, trackingNo}`；视图加 `shipments`（运营生产页同）。
- 运营 `POST /ops/customer-orders/{id}/ship`；`POST .../documents`（申请上传）、`.../documents/{docId}/complete`、`.../documents/{docId}/view-url`。
- 客户 `POST /customer/orders/{id}/confirm-receipt`、`GET .../documents/{docId}/view-url`。
- 订单视图加 `shipment`、`documents`（白名单，不含发货人 / 存储 key）。
- 随货文件上传沿用图纸的两段式 + 挪地址 + 按内容判类型（复用 `DrawingTypeGuard`，只放 PDF / JPG / JPEG / PNG）。

## 前端
- 运营报价工作台加「发货」块（弹框填单号、上传 / 下载随货文件）。
- 客户订单详情：已发货横幅 + 「确认收货」（二次确认）、发货信息卡、随货文件下载、已完成横幅。
- 供应商「发给平台」改成弹框填承运商 + 运单号；卡片列出各批单号。运营生产页同样列出。

## 被否决的方案
- **供应商单号只存在供应商订单上（覆盖式）**：返工再发会冲掉第一次的单号，需求方选了每次一条。
- **随货文件复用图纸的 `part_file` / 审计表**：图纸挂零件版本下，审计约束也绑死图纸语义；随货文件挂客户订单下，单开表。
- **随货文件分类**：需求方定不分类。

## 验证
- 先写 `ProductionFlowIT` 三个新用例（RED：3 个失败），实现后全绿；再跑全量 `mvn verify`。
- `npm run build`。
