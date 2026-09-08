# 实施计划 —— 账号密码登录

> 2026-09-08 ｜ 动手前对齐

## 必须做

- 外部用户实体 `PartyUser` + `Party`（只读，只映射登录/展示要的列）+ 仓库。
- `AuthService.authenticate(portal, account, password)`：按受众查各自的表；外部校验 party.type 匹配 + 未停用；成功更 last_login_at。`loadPrincipal(portal, userId)` 供刷新时重载。
- `RefreshTokenService`（Redis）：issue / rotate（旧作废）/ revoke。
- `LoginController`：`/auth/login`、`/auth/refresh`、`/auth/logout`；登录前 `RateLimiter.enforce`。
- `JwtService` / `UserPrincipal`：支持运营无 partyId（pid 缺席）。
- `DevAccountSeeder`：开关控，播种 ops + customer + supplier 三个测试账号。
- 删 `DevAuthController`；配置 dev-login → dev-seed；README / .env 同步。

## 关键决策与取舍

| 点 | 选择 | 为什么 |
|---|---|---|
| 一个登录入口 + portalType，还是每端一个 | **一个入口**，请求带 portalType | `/auth/**` 公开、不受端级闸门管；同一邮箱可能在运营和外部各有账号（D23），必须显式指定登哪个端 |
| refresh token 形态 | **不透明串存 Redis**，非 JWT | 30 天要能撤销（D22），撤销要状态；access 保持无状态 JWT 短命 |
| refresh 值存什么 | 只存 `受众:userId`，刷新时重载 | 反映用户当前状态（禁用账号刷新失败），不把可能过期的角色带 30 天 |
| 失败信息 | 一律 `auth.bad_credentials` | 不泄露"账号存在但密码错" |
| 运营角色 | 本轮空（RBAC 走 access_grant，后续） | 未注册路径当前放行，空角色能用 ops 端；ADMIN 引导另说 |
| 供应商 | 临时走密码 | 设计是验证码，等 OTP 轮次换 |
| UUID 绑定 | `BaseEntity.id` / `PartyUser.partyId` 显式 `@JdbcTypeCode(SqlTypes.UUID)` | 全局 preferred_uuid_jdbc_type=VARCHAR 会让真 uuid 列按 varchar 绑，运行时 `operator does not exist: uuid = character varying`（首个真查询才暴露）。同 AuditEvent 做法 |

## 被否决 / 不做

| 方案 | 为什么不 |
|---|---|
| 每端一个登录端点 | 三份重复；一个入口 + portalType 更简单 |
| refresh 用长命 JWT | 无法撤销，D22 要求可撤销 |
| 保留 DevAuthController"以防万一" | 真实登录已覆盖三端 + 有种子账号，留后门是纯风险 |
| 运营也建全套 RBAC 角色 | 超出"简单登录"；access_grant 已在，留给后续 |
| 手机验证码 / 企微 | 本轮明确只做密码 |

## 验证

- 端到端（真库真 Redis，docker）：三端登录 / whoami / 跨端 403 / 错密码·错端 401 /
  refresh 轮换 + 旧作废 / logout 撤销 / 限流 429 / 坏 token 401。
- CI：`AuthServiceTest`（mock 仓库，认证分支）+ `RefreshTokenServiceIT`（真 Redis）。
- HTTP 端到端 IT 不写：test profile 用 create-drop，实体只映射子集列，与迁移 schema 有差，
  跑 HTTP 登录易脆；端级闸门本身已由 PortalGuardIT 覆盖，端到端由手工验证兜。
