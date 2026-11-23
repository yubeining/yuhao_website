# 改密码 / 忘记密码 —— 需求

## 原话

> 转述自发起本任务的会话（2026-11-23），不是需求方逐字原话；需求方本人的原话待补。

- 现在系统里没有「用户自己改密码」，登录页也没有「忘记密码 → 重置」。
- 先调研标准的企业通用做法（OWASP、NIST SP 800-63B、主流 SaaS），再结合本仓库现状出设计方案。
- 范围：
  - 已登录用户改密码（客户、供应商、运营三类受众）
  - 登录页忘记密码 → 邮件重置
- **只出方案，不写代码。**没有依据的取值（有效期、限流次数、密码规则等）列成待定问题让本人选。

需求方 2026-11-23 对待定问题的回复（逐字）：「1、可以 2、五分钟 3 不设限流次数 4、8位 5、邮件验证吗 6、需要 7、不需要」
第二轮（逐字）：「1、B 2、保留 3、是的 4、旧的验证码或链接作废 重置成功后，直接帮他登录进去 改完密码要发邮件 可以借助这个流程 可以最长100 禁止 能接受 你起草」

第三轮（逐字）：「P1 a P2 a P3 不需要」

第四轮（逐字，实现中发现 BCrypt 只认 72 字节后）：「限制 72 字节」

（编号对应当时回复里列的问题，映射见 `2-implementation-plan.md` §1.1「已定」。）

## 背景（仓库现状，2026-11-23 读代码核实）

| 事实 | 出处 |
|---|---|
| 外部登录有两种：密码（`/auth/login`）、邮箱验证码（`/auth/otp/*`） | `ExternalAuthController`、`AuthOtpController` |
| **运营只有密码登录，没有验证码登录**（`findExternalByEmail` 只查 `external_user`） | `AuthService`、`OpsAuthController` |
| 验证码注册建出来的外部账号 **`password_hash` 为空**，只能用验证码登录 | `IdentityService` 注释、`ExternalAuthController#registerWithCode` |
| 密码用 `BCryptPasswordEncoder`（强度 10） | `SecurityConfig` |
| 现有唯一的密码规则：运营后台建号时 8～100 字符（`auth.password_invalid`） | `AccountAdminService#requirePassword` |
| refresh token 存 Redis，key 是 token 本身，值 `受众:userId`；**没有按用户的索引，无法"踢掉某人的全部会话"** | `RefreshTokenService` |
| access token 是无状态 JWT，2 小时；签出去撤不掉 | `application.yml` `app.jwt.access-token-ttl-seconds: 7200` |
| 后端**没有"前端站点地址"配置**，现有邮件里都没有链接 | `application.yml`、`i18n/*-email-*.txt` |
| 邮件模板放 `resources/i18n/<名>-<语言>.txt`，首行主题 | `OtpEmailTemplate` |
| 发信同步调用（`NotificationService.sendNow`），供应商 Resend，验证码每日预算默认 100（和其他邮件共用额度） | `OtpService` 构造器注释 |
| 没有审计表，认证类审计落结构化日志 | `OtpService#audit` 注释 |
| `/auth/**` 已整体转发给 SPA，新增 `/auth/xxx` 前端页不用改后端转发 | `SpaForwardController` |
| 三端共用一个设置页 `AccountSettingsPage`（`/customer|supplier|ops/settings`） | `router.tsx` |

## 验收（待需求方确认后补全）

- 三类受众登录后都能在设置页改自己的密码。
- 客户/供应商登录页、运营登录页（是否需要见待定 Q11）有「忘记密码」入口，能通过邮件把密码重置掉。
- 改密 / 重置后，按 Q7 的决定吊销会话。
- 不能通过这两条流程探测一个邮箱是否注册过。
