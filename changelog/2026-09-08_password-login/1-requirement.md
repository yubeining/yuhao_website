# 需求 —— 账号密码登录（三端）+ refresh token

> 提出日期：2026-09-08 ｜ 提出人：项目负责人

## 原话

> 「真实登录要做 目前先做简单的账号密码登录」

三个子决策（一个个问的）：

> 做哪几个端 → 「三个端都做密码」
> 要不要 refresh → 「一起做 refresh（推荐）」
> 库是空的，账号怎么来 → 「选 2」（开机播种三个测试账号，开关控）

## 背景

此前登录靠 `DevAuthController` 后门（不校验凭据签任意端 token，含 OPERATOR），是个安全洞。
D22 定了要 refresh token，D23 把用户拆成 `ops_user`（内部）/ `party_user`（外部）两张表。
现在把真实的账号密码登录做起来，替掉后门。供应商设计是手机验证码，本轮临时也走密码。

## 验收

1. 三个端都能用账号密码登录（`/auth/login`，请求带 `portalType`）。
2. 按受众查各自的表（运营 `ops_user` / 外部 `party_user`），外部还要校验 party.type 与端匹配。
3. 登录成功发 access（JWT）+ refresh；`/auth/refresh` 轮换、`/auth/logout` 撤销。
4. 失败一律 `auth.bad_credentials`（不泄露账号是否存在）。
5. 登录限流防爆破。
6. 运营 principal 无 partyId（D23）；JWT 支持 pid 缺席。
7. 三个测试账号开机播种（开关控，生产关）。
8. 删掉 `DevAuthController` 后门。
9. 端到端验证（真库真 Redis）+ CI 可跑的自动化测试。

## 关联

- `docs/design/11` D22（refresh）、D23（用户拆表）
- `CLAUDE.md` §3（端级隔离 / UUID principal）、§9（IT 用真依赖）
- 复用：`JwtService`、`RateLimiter`、`OpsUserRepository`
