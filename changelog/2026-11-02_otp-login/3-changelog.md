# 变更记录 —— 邮箱验证码（OTP）登录（2026-11-02）

## 验证（全部实跑）

```
mvn test                     78 项，0 失败
mvn verify                   136 项，0 失败，5 跳过（跳过项与上一轮相同：AI key / 实时行情 / 真实 S3 桶）
npm run type-check           通过
npm run build                通过（417.43 kB，gzip 128.22 kB）
迁移从零建库                 全新库（mfg_mig）启动成功：schema_migrations = 22，public 表 = 26，
                             external_user.email_verified_at 存在
```

接口冒烟（真服务 + 真库 + 真 Redis，`log-body=true` 以便从日志取码）：

| 场景 | 结果 |
|---|---|
| 已注册客户发码 → 校验 | 200，拿到 token，`portalType=CUSTOMER` |
| 同上，`external_user.email_verified_at` | 已写入 |
| 未注册邮箱发码 → 校验 | 200，`registrationRequired=true`，**未建号**（`count(*) = 0`） |
| 同一邮箱第 6 次发码 | 429 `auth.otp_rate_limited` |
| 连续错 5 次后用正确码 | 400 `auth.otp_expired` |
| `channel=SMS` | 400 `auth.otp_channel_unavailable` |
| 未注册与已注册的发码响应 | 完全相同（单测与 IT 各覆盖一次） |
| 审计日志 | `audit auth.otp.{send,verify} channel=EMAIL identifier=s***@example.com result=...`，无明文邮箱、无验证码 |

## 新增文件

**数据库**

- `database/migrations/2026-11-02_01_otp-login.sql` —— 只加 `external_user.email_verified_at`
- `database/schema.sql` 同步

**后端**（都在 `platform/auth`）

| 文件 | 作用 |
|---|---|
| `OtpChannel.java` | EMAIL / SMS（SMS 明确拒绝） |
| `OtpCodeStore.java` | Redis 里的码与失败次数，两个 key |
| `OtpService.java` | 发码、校验、签发、三层限流里的两层、审计日志 |
| `AuthOtpController.java` | `POST /auth/otp/send`、`POST /auth/otp/verify` |

**改动的现有文件**

| 文件 | 改动 |
|---|---|
| `AuthService.java` | 加 `findExternalByEmail`（验证码通过后找账号）与 `markEmailVerified` |
| `ExternalUser.java` | 加 `emailVerifiedAt` 字段与 `markEmailVerified` |
| `CacheKeys.java` | 加三个 OTP key（key 里只有标识哈希，没有邮箱） |
| `EmailSender.java` | host 为空的兜底；新增 `app.notification.email.log-body` 开关（默认 false） |
| `application.yml` | `spring.mail.*` 映射 `MAIL_*`；关闭 `management.health.mail` |
| `.env.example` | 补发信配置与本地自测开关 |

**前端**

- `services/auth.ts`：加 `sendOtp` / `verifyOtp`
- `pages/auth/SignInPage.tsx`：两种登录方式并列；验证码走两步（发码 → 输码），
  带 60 秒重发倒计时、返回上一步、错误码翻译、`registrationRequired` 时引导去注册

**测试**

- `OtpLoginFlowIT`（7 个用例）：发码响应一致性、第 6 次 429、正确码登录 + 落 `email_verified_at`、
  未注册停在注册、错 5 次作废、一次性、SMS 明确拒绝

**文档**

- `docs/design/2-系统架构.md` §4：客户认证方式改为「邮箱 + 验证码」，标注 2026-11-02 拍板；
  供应商一行注明短信通道尚未实现、当前仍用密码
- 本 changelog

## 修掉的两个问题

### 1. 每日预算阈值高于供应商额度（熔断形同虚设）

默认值原为 `2000`，而 Resend 免费档是 **100 封/天**。结果是：数到第 101 封时供应商已经开始拒收，
我们的熔断计数还远没到阈值，什么都不会拦。已改为默认 `100`，并在配置处注明
「必须 ≤ 供应商日限额；若同一账号还发别的邮件要再调低（额度共用）」。

> 这个数字是需求方给的（3,000/月、100/天）。此前 2000 是实施时自己拍的，已纠正。

### 2. 加了 spring.mail.host 之后健康检查变 DOWN

加 `spring.mail.host: ${MAIL_HOST:}` 之后，**空的 host 也会让 Spring 装配 `MailHealthIndicator`**。
它会真的去连 SMTP，连不上就把整体 `/actuator/health` 变成 `DOWN` —— 而 `deploy.sh` 正是拿这个
端点判活，结果是部署时被判"启动失败"然后自动回滚。

实测确认（本地无 SMTP 启动后 `{"status":"DOWN"}`，日志里是
`MailHealthIndicator: Mail health check failed`），已通过 `management.health.mail.enabled: false` 关闭。
关掉的理由不只是"绕开报错"：**邮件可达性不是应用存活信号** —— 发不出去只影响验证码这一条链路，
业务照常，而健康检查闪烁会导致误回滚。

## 部署清单

1. **必须配**（否则验证码只打日志、用户收不到）：
   `MAIL_HOST=smtp.resend.com`、`MAIL_PORT=587`、`MAIL_USERNAME=resend`、
   `MAIL_PASSWORD=<Resend API key>`、`MAIL_FROM=<mail 子域上的地址>`
2. 发信子域要配 SPF / DKIM / DMARC，否则验证码大面积进垃圾箱
3. `APP_NOTIFICATION_EMAIL_LOGBODY` 生产必须是 `false`（默认就是）
4. 无迁移破坏性变更：只加一列，旧版本代码面对新 schema 正常

## 遗留项

- **未注册邮箱建号那一步没做**：现在停在 `registrationRequired=true`。要做需要先定
  「填哪些公司信息、谁来填」—— 与 `supplier/ProfilePage` 是同一类待确认问题
- **短信通道未实现**：`channel=SMS` 明确返回不可用。落地时要补 `NotificationChannel.SMS`、
  `SmsSender`、`external_user.phone` / `phone_verified_at`、阿里云签名与模板
- **没有持久化审计表**：`audit_event` 在 2026-09-08 的迁移里被删掉了，现在审计只落结构化日志。
  要能"一键导出"得先把表建回来
- **验证码未接图形验证 / 人机校验**：目前靠三层限流挡
