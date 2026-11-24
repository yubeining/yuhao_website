# 变更记录

## 实际改动
- 迁移 `2026-11-24_01_shipping.sql` + `schema.sql`（只合入本次相关的块）+ 迁移 README（归属表、迁移列表、表数 27 → 30）。
- 后端：`SupplierShipment` / `CustomerOrderDocument` / `CustomerOrderDocumentAccessLog` 实体与仓库；`ShippingService`；
  `OpsShippingController` / `CustomerShippingController`；供应商发货接口改为必带承运商 + 运单号；
  订单视图（客户 / 运营）加 `shipment`、`documents`；供应商订单视图、运营生产视图加 `shipments`。
- 前端：运营 `ShippingCard`、客户 `ShipmentCard`、供应商发货弹框、生产页单号列；状态「已发货 / 已完成」与错误码中英文案。

## 测试
- `ProductionFlowIT` 新增 3 个：供应商发货必填 + 两批都留；运营发货 + 客户确认收货（含越权 404 / 403、状态不对 409、白名单不露发货人）；
  随货文件上传 / 类型拒收 / 客户只见传完的 / 每次下载落审计 / 别家 404 不落审计 / 发货后可补传 / 确认收货后锁定。
- 原有用例的供应商发货调用都补上了承运商 + 运单号。

## 部署
- 一次发布：先跑迁移（只加列、加表、放宽 CHECK），再起新 jar。
- **回滚风险**：库里一旦有 `SHIPPED` / `COMPLETED` 的客户订单，回滚到旧 jar 后旧代码读这些行会因为不认识的枚举值出错。

## 遗留
- 运营「已收到货」动作（待定）、供应商发货件数（暂不填）、客户迟迟不确认收货（先不管）、物流跟踪（先不查）。
- 随货文件没有删除功能（需求没提）；传错了只能再传一份。
- 本地没有运营 / 供应商账号，界面只做了构建检查，没有在浏览器里实际点过运营发货和供应商弹框。
- 生成 schema.sql 时在本地测试库容器（mfg-postgres-test）里建了一个临时库 `schema_dump_scratch`，没有删。
