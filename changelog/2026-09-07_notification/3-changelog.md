# 变更记录 —— 通知服务（传输层）

> 2026-09-07 ｜ 平台层新增 ｜ 无 schema、无 domain

## 为什么没有 2-implementation-plan.md

范围单一、方案在需求里已对齐（只做传输、内容调用方给、不建 log 表、失败打日志），
被否决项也已在提问时列出。diff 看「为什么」不留疑问。

## 新增 `platform/notification/`

- `NotificationChannel`（EMAIL / WECHAT）
- `NotificationRequest`（channel / recipient / subject / body，成品文案由调用方给）+ `email()` / `weChat()` 工厂
- `NotificationSender` 接口（每渠道一个实现，Spring 自动收集）
- `NotificationService`：
  - `notify(req)` —— 业务通知，走 `AfterCommitExecutor`（有事务等提交后异步发、回滚不发；无事务直接异步），失败记日志
  - `sendNow(req)` —— 同步发（OTP 类），失败抛 `NotificationException`
  - 同一渠道两个 sender → 启动即报错
- `EmailSender`（JavaMailSender）：没配 SMTP（无 `JavaMailSender` bean）或 `email.enabled=false` → log-only，收件人打码不落完整邮箱
- `WeChatSender`：企微 corp API **尚未接入**，默认 log-only；enabled=true 时 warn 提示未实现
- `NotificationException`

## 边界（本轮不做）

- 模板 / i18n —— 文案由调用方给；真有业务事件时按收件人 locale 写
- `notification_log`（发送状态留痕）、重试、死信 —— 失败只打日志
- 企微真实集成（拿 corp token、调发消息、token 缓存/限流）

## 验证（跑过）

```
NotificationServiceTest        Tests run: 5   ← 分发到正确渠道 / sendNow 成功与抛错 / 无 sender / 重复渠道拒绝
全上下文启动 (PortalGuardIT)     Tests run: 7   ← 通知 bean 装配、无 SMTP 不崩
其余 (Access 4 / Memory 5)      全绿，BUILD SUCCESS
```

## 部署清单

- 无迁移、无新密钥。合并即生效。
- 要真发邮件：配 `spring.mail.host` 等 + `MAIL_FROM`。要发微信：接企微 API（另一项）。
  在那之前所有通知 log-only，不影响流程。
