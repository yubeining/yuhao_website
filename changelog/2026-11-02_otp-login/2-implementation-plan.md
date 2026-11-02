# 实施计划 —— 邮箱验证码登录（2026-11-02）

## 接入点（都按现有结构接，不另开一套）

| 要做的事 | 接到哪 |
|---|---|
| 发信 | 现有 `NotificationService.sendNow()`（它的注释里本来就写着「如登录 OTP」） |
| 签发 token | 现有 `AuthTokenIssuer.login()` —— 和密码登录**同一个出口**，不写第二套 |
| 限流 | 现有 `RateLimiter`（Redis 固定窗口）+ `@RateLimit` 注解（IP 层） |
| 缓存 key | `CacheKeys` 集中目录，不手拼字符串 |
| 打码 | 现有 `SensitiveData.maskEmail()` |

## 关键设计

**1. 存哈希不存明文，key 里不出现邮箱**

- Redis key：`auth:otp:code:{channel}:{sha256(邮箱)}` —— key 会被 SCAN / 监控 / 备份带走，不能放 PII
- Redis value：`sha256(标识哈希 + ":" + 码)` —— 把标识拌进去，同一个码换个人用就不同

**2. 码和"失败次数"分开两个 key**

`RedisService.set` 每次写都会**重置 TTL**。如果把"码 + 次数"存在一个值里，
每错一次都要重写，码的有效期就被一次次续满 —— 攻击者可以靠不停试错让一条码永不过期。
次数单独用自增计数（只在第一次设 TTL）就没这个问题。

**3. 三层限流的落点**

| 层 | 阈值 | 在哪 | 为什么 |
|---|---|---|---|
| 同标识 | 5 次/小时 | `OtpService` | key 要用哈希后的标识（避免 PII），注解的 SpEL 不方便做哈希 |
| 同 IP | 20 次/小时 | `@RateLimit`（key 留空 = 客户端 IP hash） | 正是注解的既有能力，没必要重写 |
| 全局每日预算 | 100 次/天（= Resend 免费档日限额） | `OtpService` + Redis 计数 | 防有人用海量不同邮箱刷爆发信额度（费用熔断）。**阈值必须 ≤ 供应商日限额**，原来写的 2000 比 100 大 20 倍，熔断永远不会触发 |

**4. 未注册邮箱：验证通过后停在 `registrationRequired`**

不自动建号。`organization.name` 是 NOT NULL，自动建号就必须编一个公司名，
而公司名会流进报价单和合同（CLAUDE.md §10 C5）。

这个"停住"不构成账号枚举：能走到这一步的人已经证明自己能收到该邮箱的邮件。

**5. 邮箱正文用英文 ASCII 字面量**

后端禁止非 ASCII 字符串字面量（i18n code 由前端翻译）。邮件正文不属于 API 响应，
但也不该塞中文进 Java —— 客户是欧洲买方，英文正文是正确的默认。

## 被否决的方案

- **把 OTP 也做成一个 `IdentityExchanger` 接口**（文档 2 §4 的理想形态）。
  现在的代码里只有"密码登录"一种方式，为一个实现抽接口是空抽象。
  等第二种方式（短信 / SSO）真的落地时再抽，那时才知道接口该长什么样。
- **用 `@JsonInclude` 让 `token` 显式输出 null**。前端只需要看 `registrationRequired`，
  省略 null 字段更干净；测试改成判 `hasNonNull`。
- **在 log-only 模式下默认把验证码打进日志**。验证码是凭据，默认进日志不可接受；
  改成显式开关 `app.notification.email.log-body`，默认 false，本地自测时才开。

## 风险

- 发信被退信 / 进垃圾箱时用户收不到码，且**后端看起来一切正常**（send 成功）。
  上线前必须给 `MAIL_FROM` 配好独立子域 + SPF/DKIM/DMARC。
- `EmailSender` 原先只判 `mailSender == null`；`application.yml` 里写了 `host: ${MAIL_HOST:}`
  之后，空字符串也会让 Spring 创建 `JavaMailSender`，于是"没配 SMTP"被当成"配好了"，
  第一次发码就抛异常。本轮加了一道 `host` 为空的兜底。
