# 改密码 / 忘记密码 —— 改动记录

按 `2-implementation-plan.md` v3 实现（需求方 2026-11-23「批准，开始写」）。

## 后端

| 文件 | 改动 |
|---|---|
| `platform/identity/PasswordPolicy.java`（新） | 密码规则唯一一处：至少 8 位、UTF-8 不超过 72 字节。运营建号也改用它 |
| `platform/identity/AccountAdminService.java` | `requirePassword` 委托给 `PasswordPolicy`，删掉自己的两个常量 |
| `common/service/RedisService.java` | 新增 `setAdd / setRemove / setMembers`（不吞异常，用于吊销会话） |
| `common/cache/CacheKeys.java` | 新增 `refreshIndex`、`passwordCode`、`passwordCodeAttempts` |
| `platform/auth/RefreshTokenService.java` | 签发 / 轮换 / 登出同步维护「用户 → refresh token」索引；新增 `revokeAll(受众, userId)` |
| `platform/auth/PasswordCodeStore.java`（新） | 改密 / 重置验证码存储，和登录验证码分命名空间，再按 RESET / CHANGE 分 |
| `platform/auth/PasswordService.java`（新） | 发码、重置、改密；5 分钟、错 5 次作废、成功后吊销全部会话、发通知邮件 |
| `platform/auth/PasswordResetController.java`（新） | `POST /auth/password/forgot`、`POST /auth/password/reset`（重置成功返回登录态） |
| `platform/auth/MePasswordController.java`（新） | `POST /{customer,supplier,ops}/me/password/code`、`PUT /{…}/me/password` |
| `platform/auth/AuthService.java` | 新增 `setPassword(受众, userId, 新密码)`：规则校验 + 不能与当前相同 |
| `platform/auth/OtpEmailTemplate.java` | 新增 `renderNamed(模板名, 语言, 变量)`，原 `render` 不变 |
| `resources/i18n/password-code-email-{zh,en}.txt`、`password-changed-email-{zh,en}.txt`（新） | 邮件文案（§6 草稿原样） |

## 前端

| 文件 | 改动 |
|---|---|
| `pages/auth/ForgotPasswordPage.tsx`（新） | 两步：发码 → 码 + 新密码 ×2，成功直接登录 |
| `pages/auth/SignInPage.tsx` | 密码模式下加「忘记密码？」链接（运营登录页不加） |
| `router.tsx` | `/auth/forgot`（`/auth/**` 已由 `SpaForwardController` 转发，后端不用改） |
| `pages/AccountSettingsPage.tsx` | 「登录密码」卡片 + 弹框；成功后清登录态跳本端登录页 |
| `services/auth.ts` | `forgotPassword / resetPassword / sendMyPasswordCode / changeMyPassword` |
| `i18n/strings.ts` | `forgotPw`、`profile` 改密字段、3 个错误码（zh / en） |

## 测试

- `PasswordPolicyTest`（单元）4 个：8 位、72 字节、24 个汉字为边界
- `PasswordFlowIT`（真 PostgreSQL + 真 Redis）16 个：防枚举（已注册 / 未注册 / 禁用 / 运营邮箱响应一致）、
  重新申请旧码作废、重置成功直接登录且旧密码失效、重置吊销全部会话且不影响他人、一次性、错 5 次作废、
  与当前密码相同被拒且码不被消耗、过短被拒、无密码账号可设密码、登录码不能用来重置、
  三端改密（客户 / 运营）、错码不改密码、客户 token 打运营路径 403、匿名 401

## 部署清单

- **无迁移、无新配置项、无新环境变量。**
- 上线后：**上线前已签发的 refresh token 不在新索引里**，改密 / 重置吊销不到它们，会活到自然过期（最长 30 天）。
  access token 改密后最长残留 2 小时（需求方已接受）。

## 遗留 / 已知问题

1. **BCrypt 72 字节上限 —— 已定：限制为 72 字节**（需求方 2026-11-23「限制 72 字节」）。
   实测 Spring Security crypto 7.1.1：`encode` 超过 72 字节抛 `IllegalArgumentException`（接口 500），
   `matches` 只比前 72 字节。现在 `PasswordPolicy` 按 UTF-8 字节数拦，超过返回 `auth.password_invalid`：
   英文最多 72 位，中文最多 24 个字。运营建号同样走这条规则，原来的 500 也一并消失。
   运营建号接口 DTO 上的 `@Size(max = 100)` 没动，实际上限以 `PasswordPolicy` 为准。
2. 「不设申请次数」+「重新申请旧码作废、错次清零」→ 错 5 次的限制可被反复申请绕过（需求方 P1 选 a，已接受）。
3. 运营后台没有「管理员重置他人密码」，运营忘记密码目前没有自助渠道（不在本次范围）。
4. 邮件里没有客服联系方式（系统里没有这项数据）。
5. 运营收到「密码已修改」邮件里写着「重新设置密码」，但运营没有忘记密码入口 —— 文案是否给运营单独一版未定。
