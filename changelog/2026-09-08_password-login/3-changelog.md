# 变更记录 —— 账号密码登录（三端）+ refresh token

> 2026-09-08 ｜ 平台层 ｜ 无 schema 变更（读现有表）

## 新增

- `platform/auth/PartyUser` + `Party`（只读实体，映射登录/展示列）+ 各自仓库。
- `platform/auth/AuthService`：三端账号密码认证；外部校验 party.type 匹配 + 未停用；失败一律 `auth.bad_credentials`；更 last_login_at；`loadPrincipal` 供刷新重载。
- `platform/auth/RefreshTokenService`：Redis 存不透明 refresh token，issue / rotate（旧作废）/ revoke。
- `platform/auth/LoginController`：`POST /auth/login | /auth/refresh | /auth/logout`；登录前 `RateLimiter.enforce`（默认 10 次/5 分钟，可配 `app.auth.login.*`）。
- `platform/auth/DevAccountSeeder`：`app.auth.dev-seed.enabled=true` 时开机播种 ops/customer/supplier 三个测试账号（幂等）。

## 修改

- `JwtService`：签发/解析支持运营无 partyId（pid 缺席用可变 Map，不用 Map.of）。
- `persistence/BaseEntity`、`auth/PartyUser`：UUID 列显式 `@JdbcTypeCode(SqlTypes.UUID)`
  —— 修全局 `preferred_uuid_jdbc_type=VARCHAR` 导致的 `uuid = character varying` 绑定错。
- `application.yml`：`app.auth` 下 dev-login → login（限流参数）+ dev-seed。
- `README.md` / `.env` / `.env.example`：dev-login → dev-seed；顺带修正几条过时状态。

## 删除

- `platform/auth/DevAuthController`（后门，真实登录已覆盖三端，README 早就写明"随真实登录一起删"）。
  前端 `services/auth.ts#devLogin` 仍在（前端跑 mock），接真后端时清。

## 验证

**端到端（真库真 Redis，docker）跑过：**

```
运营/客户/供应商 登录 → 200 + token；whoami 各自端 200（运营无 partyId、roles []；外部有 partyId、roles [ADMIN]）
运营 token → /customer/whoami            → 403 wrong_portal
错密码 / 客户账号登供应商端              → 401 auth.bad_credentials
refresh                                  → 换新 access+refresh；旧 refresh 再用 → 401 refresh_invalid
logout                                   → 200；被撤销的 refresh 再用 → 401
连刷错密码超限                            → 429（RateLimiter，窗口内累计）
坏 access token                          → 401
```

**CI 自动化：** `AuthServiceTest` 7（mock 仓库，认证分支）+ `RefreshTokenServiceIT` 3（真 Redis）；
全套 `mvn verify` BUILD SUCCESS（S3 IT 无凭据跳过）。

## 部署清单

- 无迁移。合并后下次部署生效。
- ★ 生产 `.env`：`DEV_SEED_ENABLED=false`（否则播种弱口令后门账号）。生产运营管理员另配。
- 前端仍跑 mock，本次不影响线上前端行为。

## 遗留项

| # | 事项 |
|---|---|
| 1 | 供应商手机验证码、运营企微扫码（OTP 轮次） |
| 2 | 运营 RBAC：粗粒度角色 / 首个 ADMIN 引导（access_grant 已在） |
| 3 | 前端 `services/auth.ts#devLogin` 清理 + 前端接真登录 |
| 4 | 登录限流按账号计数，理论上可被用来锁定某账号；需要时改按 IP 或加验证码 |
| 5 | 注册 / 邀请开户（外部用户自助进来）未做 |
