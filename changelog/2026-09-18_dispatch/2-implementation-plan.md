# 第 4 步：供应商入驻 → 组生产订单 → 派单 → 供应商接单

## Context

第 3 步之后，客户能确认报价，但确认之后没有下文：线上没有供应商账号，运营端派单、供应商端接单都还是原型页（数据已清空）。
第 4 步让一张已确认的单走到「供应商接下」为止。合同、签字、生产、质检不在本轮。

分两次交付，各自一个迁移、一次部署、一次线上验证：
- **4a 供应商入驻**：邀请 → 注册 → 运营录折率和能力
- **4b 组单派单接单**：拆行进生产订单 → 定向派 / 挂全市场 → 接单 / 拒接 → 签字前双方可退

## 依据（已拍板，全部记在文档 11 / 12 / 13）

| 项 | 定的 |
|---|---|
| 范围 | 做到供应商接单为止（2026-09-18） |
| 派法 | 运营每单二选一：定向派几家（先到先得）/ 挂全市场（所有可接单供应商，先到先得）；两条路不互转（12 §3） |
| 生产订单 | 整单交给一家；可以装多个客户订单的零件（D13） |
| 拆行 | 同一零件行可拆给多家；**一次拆完**：拆的时候各份之和必须 = 该行数量（12 §1，2026-09-18） |
| 有人拒接 | 只把他移出，其余照常可接；全部拒接才回运营待派 |
| 签字前 | 供应商可退单，运营可收回重派（12 §4） |
| 没人接 | 不监控、不兜底（Q13 推后） |
| 对供价 | 原价 × 该供应商折率；**填 0.8 = 乘 0.8**；各家看到各自的价（13 §2.2） |
| 对供交期 | 运营每次派单时手填，页面显示客户交期供参考 |
| 供应商看得到 | 零件名称 + 图号、材料 + 表面处理、数量 + 对供单价 + 小计、交期、图纸（派到他就能看，每次看落审计）；**客户身份、对客价看不到**（D8 / D13） |
| 供应商账号 | 只能运营邀请；链接 7 天有效、用一次失效、可作废；注册只填公司名 + 联系人 + 邮箱 + 密码 |
| 何时能派给他 | 运营录好折率就能派；能力可后补 |
| 能力库 | 工艺 / 材料 / 尺寸范围 / 精度等级，自由文本，派单时列给运营看，系统不判断匹配 |

### 推导（不是给定的，写明前提）
- **对供单价取整**：沿用对客价的规则（2 位四舍五入，小计 = 单价 × 数量）。前提：没单独定，按同一套写法最不容易对不上。
- **对供交期存日期**：运营手填一个交货日期；客户交期（确认日 + N 天）在页面上换算成日期给运营参考。前提：一张生产订单可能混着几张客户单，各自确认日不同，换成日期才能放一起比。
- **邀请绑定邮箱**：注册邮箱必须是邀请上写的那个，防链接转手。
- **本轮不做生产订单取消**：取消一张会让被拆开的那一行只剩一部分已派，破坏「一次拆完」。改为「撤回分配」（整行所有份一起撤）+ 删除空的生产订单。

## 放哪（模块边界）

| 内容 | 位置 | 理由 |
|---|---|---|
| 供应商邀请 + 凭邀请注册 | `platform/identity` | 建组织和用户本来就在这里；外部注册已经拒绝 SUPPLIER |
| 折率 + 能力 | **新域 `domain/supplier`**（文档 2 目录规划里已有「供应商能力库」） | 订单域派单时要判断「有没有折率」，报价域算对供价要用折率；放报价域会让订单域反向依赖报价域 |
| 生产订单、派单、接单、供应商订单 | `domain/order`（表本来就归它） | 12 §11 |
| 对供价计算、接单时的价格快照 | `domain/quote` | 价格不往订单表加列（13 §3.5）；原价在报价行上 |

依赖方向：`quote → order`、`quote → supplier`、`order → supplier`，无环。
接单时价格快照：订单域发同步领域事件 `SupplierOrderAccepted`，报价域在**同一事务**里写快照；写不成（比如折率被清了）整个接单回滚。

---

## 4a 供应商入驻

**迁移 `2026-09-18_01_supplier-onboarding.sql`**
- `supplier_invite`（platform/identity）：`token_hash` 唯一（只存 SHA-256，明文只出现在生成时的响应里）、`org_name`、`email`、`expires_at`（+7 天）、`used_at` / `used_by_org_id`、`revoked_at`、`created_by`
- `supplier_profile`（domain/supplier）：`supplier_org_id` 唯一、`discount_rate numeric(8,4) > 0` 可空、`processes` / `materials` / `size_range` / `precision_grade`（text，可空）

**后端**
- 运营：`POST /ops/supplier-invites`（企业名、邮箱 → 返回一次性链接）、`GET /ops/supplier-invites`、`POST /ops/supplier-invites/{id}/revoke`
- 公开：`GET /public/supplier-invites/{token}`（有效与否、企业名、邮箱）、`POST /public/supplier-invites/{token}/register`（公司名、联系人、密码）→ 建 SUPPLIER 组织 + 用户；过期 / 用过 / 作废 → 410；并发两次注册只有一次成功（条件更新 `used_at is null`）；按 IP 限流（复用 `@RateLimit`）
- 运营：`GET /ops/suppliers`（组织名、状态、折率、能力、可否派单）、`PUT /ops/suppliers/{orgId}/discount`、`PUT /ops/suppliers/{orgId}/capability`（upsert，同加成率的并发写法）
- 对外契约 `SupplierDirectory`：`discountOf(orgId)`、`dispatchable()`（ACTIVE 且有折率的供应商）

**前端**：`/auth/invite?token=` 注册页（替换原型三步表单）、`ops/OnboardingPage`（邀请管理）、`ops/PartiesPage`（供应商列表 + 折率 + 能力）接真，去掉原型横幅；供应商登录后能进供应商端（此时订单市场为空）

**测试**：`SupplierInviteIT`（生成 → 注册 → 登录；过期 / 用过 / 作废 / 邮箱不符；并发注册；链接明文不入库；客户 / 供应商调运营接口 403）、`SupplierDirectoryIT`（折率校验、并发 upsert、没折率不在可派名单）

---

## 4b 组单、派单、接单

**迁移 `2026-09-18_02_dispatch.sql`**
- `ops_order` 加 `status`（ASSEMBLING / PUBLISHED / OFFERED / ASSIGNED）、`dispatch_mode`（TARGETED / MARKET）、`supplier_due_date`、`dispatched_at`
- `ops_order_offer`：`ops_order_id`、`supplier_org_id`、`status`（OFFERED / DECLINED / REVOKED），唯一 `(ops_order_id, supplier_org_id)`
- `supplier_order` 加 `ops_order_id`、`status`（ACCEPTED / CANCELLED）、`accepted_at`、`cancelled_at`、`cancel_reason`（WITHDRAWN / REVOKED）；部分唯一索引「每张生产订单最多一张 ACCEPTED 的供应商订单」兜底并发接单
- `supplier_price_line`（domain/quote）：接单时快照 —— 供应商订单行、原价、折率、对供单价、小计
- `part_file_access_log.context_type` 加 `OPS_ORDER`、`SUPPLIER_ORDER`

**后端 · 运营**（domain/order）
- 待派池 `GET /ops/dispatch/pool`：已确认客户单里还没分配的行
- `POST /ops/ops-orders`（建空的生产订单）、`DELETE`（只能删空的）
- `POST /ops/dispatch/allocate {customerOrderPartId, parts:[{opsOrderId, quantity}]}`：数量之和必须 = 该行数量，否则 400；该行已分配过 → 409；目标生产订单必须都在组装中
- `POST /ops/dispatch/unallocate {customerOrderPartId}`：该行所有份一起撤，涉及的生产订单必须都在组装中
- `POST /ops/ops-orders/{id}/offer {supplierOrgIds, supplierDueDate}` / `.../publish {supplierDueDate}` / `.../recall`（收回到组装中）/ `.../revoke-supplier`（接单后签字前收回，供应商订单 CANCELLED）
- 生产订单列表 / 详情（行、来源客户、派给谁、谁接了）
- 报价域：`GET /ops/ops-orders/{id}/supplier-prices`（每家可派供应商的对供单价、合计，按当前折率现算）；`GET /ops/quote-summaries` 补上已确认单的客户交货日

**后端 · 供应商**
- 订单域：`GET /supplier/offers`（派给我的 + 市场上的）、`GET /supplier/offers/{id}`、`POST .../accept`、`POST .../decline`（只对定向）、`GET /supplier/orders`、`POST /supplier/orders/{id}/withdraw`、两种上下文下的看图（先校验这张单派给了我 / 是我的，再签 URL，落审计）
- 报价域：`GET /supplier/offer-prices?opsOrderIds=`（我的对供价，先经订单域校验我看得到这些单）、`GET /supplier/order-prices`（接单时的快照）
- 白名单视图，**不含**客户组织 id / 名称、客户订单 id、对客价、加成率

**并发**：加锁顺序固定「客户订单 → 生产订单（按 id 排序）→ 供应商订单」。接单、收回、拒接、退单都先锁生产订单；部分唯一索引兜底。

**前端**：`ops/DispatchPage`（待派池 + 分配 + 生产订单列表）、`ops/ProdPage`（生产订单详情：行、各家对供价、定向 / 挂市场、收回）；`supplier/HallPage`、`HallDetailPage`（看单、看图、接 / 拒）、`supplier/OrdersPage`（我的订单 + 退单）接真，去掉原型横幅。`WonPage` 并进 OrdersPage；`BillPage` / `ProfilePage` 保持原型

**测试**：`DispatchFlowIT`
- 分配：和 ≠ 数量 400、重复分配 409、非组装中 409、撤回分配整行撤
- 定向：只有被派的几家看得到；一家拒接其余仍可接；全拒接回组装中
- 市场：所有可派供应商看得到，没折率的看不到
- 接单：生成供应商订单 + 行 + 价格快照；接单后改折率快照不变；别家再接 409
- 退单 / 收回：回组装中，可再派
- 隐私：供应商端所有响应里不出现客户名、客户组织 id、对客价
- 看图：派到才能看，落审计（上下文 OPS_ORDER / SUPPLIER_ORDER）
- 越权：别家供应商 404、客户 / 供应商调运营接口 403
- 并发 30 轮：两家同时接同一单只有一家成功；同一行同时分配两次只有一次成功；接单 vs 收回只有一个成功

## 不做（本轮）

合同 / 签字 / 签字超时 · 生产进度、质检、发货 · 没人接的提醒 · 能力自动匹配 · 供应商详细资质（开票、银行、执照）· 通知（邮件）· 生产订单取消 · 客户端展示派单进度（客户看到的状态仍是「已确认报价」）

## 顺序（TDD，每段先写失败的 IT）

4a：迁移 → 本地 psql 验 → `SupplierInviteIT` / `SupplierDirectoryIT` → 实现 → 前端 → 全量 `mvn verify` + 从零建库 → 提交 → 部署 → 线上验（你生成邀请，我注册供应商）
4b：同上，`DispatchFlowIT` → 实现 → 前端 → 回归 → 提交 → 部署 → 线上走通「客户确认 → 分配 → 定向派 → 拒接 → 另一家接 → 退单 → 挂市场 → 接」

## 风险

- 4b 体量大（后端约 30 个类、5 个页面），按步骤提交，每步都有测试
- 同步领域事件是仓库里第一次用；接单和快照必须同事务，测试里专门验「快照写失败时接单回滚」
- 线上验证需要两个供应商测试账号：邀请链接由运营账号生成（在你已登录的浏览器里），注册走接口脚本，和之前建测试客户一样
