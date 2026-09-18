# 变更记录 —— 第 4 步

## 4a 供应商入驻（2026-09-18）

### 改了什么

- **迁移** `2026-09-18_01_supplier-onboarding.sql`：`supplier_invite`（只存 token 的 SHA-256；唯一；「已用」和「用它建的组织」同时有或同时无）、
  `supplier_profile`（每家一行；折率 `numeric(8,4) > 0` 可空；四项能力自由文本）
- **`platform/identity`**：`SupplierInviteService` + 运营端 `POST/GET /ops/supplier-invites`、`POST /ops/supplier-invites/{id}/revoke`，
  公开端 `GET /auth/supplier-invites/{token}`、`POST /auth/supplier-invites/{token}/register`。
  链接 7 天、用一次失效；邮箱就是邀请上的那个；邮箱已有账号不发邀请（409）；无效链接一律 410 `auth.invite_invalid`；
  注册建 SUPPLIER 组织 + 用户 + 用掉邀请在同一事务，用掉靠条件更新，并发只成功一次；查看、注册按 IP 限流
- **新域 `domain/supplier`**：`SupplierProfileService` + `GET /ops/suppliers`、`PUT /ops/suppliers/{orgId}/discount`、`PUT .../capability`；
  写入各一条 `INSERT … ON CONFLICT DO UPDATE`（折率、能力互不覆盖、并发不 500）；对外契约 `SupplierDirectory`（`discountOf`、`dispatchable`），给 4b 用
- `OrganizationRepository.findByTypeOrderByCreatedAtDesc`
- **前端**：`/auth/invite?token=` 换成真注册页（原型三步长表单不再从这里进）；运营端「供应商入驻」换成邀请管理（链接只显示一次，可复制、可作废，删掉了原型的「资质考察 / 定级」）；
  「交易方」换成供应商列表 + 折率 + 能力编辑（删掉了原型的「级别」）。这两页去掉原型横幅

### 验证（实跑）

| 项 | 结果 |
|---|---|
| 迁移 psql 预演（事务内跑两遍再回滚） | 两遍都不报错；重复 token 哈希、「已用」缺组织、折率 0 三条都被拒 |
| 迁移从零建库（临时 postgres:16） | 全部成功，23 张表，结构和 `schema.sql` 一致 |
| `SupplierInviteIT` | 7/7：邀请 → 注册 → 登录进供应商端；链接明文不入库；过期 / 作废 / 不存在 410 且不建组织；供应商不能自助注册；已注册邮箱不发邀请；字段校验失败不消耗邀请；并发注册 10 轮每轮只成功一个；客户 403、未登录 401 |
| `SupplierDirectoryIT` | 6/6：录折率后可派单；能力和折率互不覆盖；非法折率 / 超长能力 400；客户组织、不存在 404；停用的不可派；折率和能力同时首次写 15 轮全 200；客户 403 |
| 全量 `mvn verify` | 单测 76/76；集成测试 103 条 0 失败，5 条跳过（外部凭据） |
| 前端 `npm run build` | 通过 |
| 本地浏览器 | 运营生成邀请 → 链接只显示一次 → 注册页预填企业名、邮箱只读 → 注册（接口）→ 同一链接再开显示「邀请链接无效」、不带 token 显示「没有有效的邀请」→ 供应商能登录 → 交易方里录折率 0.8 和能力 → 变成「可派单」 |

### 部署清单

- [ ] 点 Action。迁移开机自动执行（只加表）
- [ ] 无新 secret、无新环境变量
- [ ] 验：commit 对得上 + health UP；运营生成一条邀请，注册一个测试供应商，录折率
