# 改密码 / 忘记密码 —— 设计方案（待批准，未写代码）

> 状态：**方案稿 v3**（需求方 2026-11-23 三轮回复已全部落入 §1）。待需求方审 §6 文案并批准后动代码。
> - **【标准】** 引自外部标准，注明出处
> - **【现状】** 本仓库代码里已有的事实（见 `1-requirement.md` 背景表）
> - **【已定】** 需求方回复，原话见 §1
> - **【推导】** 由已定项推出来的结论，写明前提

---

## 0. 调研结论（只列核实过的）

| 来源 | 要点 | 核实程度 |
|---|---|---|
| OWASP Forgot Password Cheat Sheet | 存在/不存在的账号**同一响应、同一耗时**；token 用安全随机数、足够长、绑定用户、**用后作废**、「适当时间」过期（**没给具体时长**）；URL **不能用 Host 头拼**；PIN 方案 6～12 位；重置后**发通知邮件、不自动登录**、询问或自动注销其他会话；**不要因忘记密码请求锁账号** | 整页已读 |
| OWASP Authentication Cheat Sheet | 改密码要求**已登录 + 校验当前密码**；无 MFA 时短于 15 位算弱、有 MFA 时短于 8 位算弱；最大长度至少 64；**不要求大小写/数字/符号组合**；用泄露密码库拦截；不强制定期改密 | 相关段落原文已读 |
| NIST SP 800-63B Rev 4（2025-08） | 单因素密码最少 **15** 位，MFA 中最少 8 位（§3.1.1.2）；最大长度应允许至少 64；**禁止组合规则**、**禁止定期强制改密**；新密码必须过黑名单；必须校验**完整**密码、不得截断；账号恢复等事件**必须通知**（§4.6） | §3.1.1.2、§4.6 原文已读；§4.2 恢复码有效期**未读到原文，不引用** |
| Slack 帮助文档 | 通过邮件里的码重置；密码至少 8 位；不能复用旧密码 | 帮助页已读 |
| Auth0 | 有「改密链接邮件」和「改密验证码邮件」两种模板 | 只读到模板页 |
| GitHub / Atlassian | — | 文档页 404，未取得，不引用 |

---

## 1. 决定

### 1.1 已定（需求方 2026-11-23）

第一轮原话：「1、可以 2、五分钟 3 不设限流次数 4、8位 5、邮件验证吗 6、需要 7、不需要」
第四轮原话（实现中发现 BCrypt 72 字节问题后）：「限制 72 字节」
第二轮原话：「1、B 2、保留 3、是的 4、旧的验证码或链接作废 重置成功后，直接帮他登录进去 改完密码要发邮件 可以借助这个流程 可以最长100 禁止 能接受 你起草」

| 项 | 决定 | 与标准的差异 |
|---|---|---|
| 忘记密码凭证 | **6 位邮件验证码**，页面上输入码 + 新密码 | — |
| 有效期 | **5 分钟** | OWASP 未给数 |
| 限流 | 申请、提交**不设次数限制**；**保留**「一条码错 5 次作废」 | OWASP 建议按账号限流（见 §8 R1） |
| 密码长度 | 至少 **8** 位，最长 **72 字节**（第二轮定 100 位；实测 BCrypt 超 72 字节存不进去后，第四轮改为「限制 72 字节」） | NIST 单因素要求 ≥15 |
| 新密码不能与当前密码相同 | **禁止相同**（只比当前一个，不存历史 → 不建表） | — |
| 已登录改密码验证身份 | **邮件验证码**（不要求输入当前密码） | OWASP 建议校验当前密码 |
| 改密 / 重置后会话 | **所有设备都要重新登录**，含当前设备 | — |
| access token 残留 | **接受**改密后旧 access token 最长 2 小时内仍可用 | — |
| 重复申请 | **旧码立即作废** | — |
| 重置成功后 | **直接登录**（返回登录态） | OWASP 建议不自动登录 |
| 改完发通知邮件 | **发** | 与标准一致 |
| 没设过密码的外部账号 | **可以**用忘记密码流程设第一个密码 | — |
| 运营登录页「忘记密码」 | **不加** | — |
| 邮件文案 | **我起草，需求方审**（草稿见 §6） | — |

### 1.2 第三轮（已定）

原话：「P1 a P2 a P3 不需要」

| # | 决定 |
|---|---|
| P1 | **接受**反复申请绕过错 5 次的风险，不加申请次数限制 |
| P2 | 重置 / 改密验证码**不计**每日发信预算（沿用现状：只有未注册邮箱计） |
| P3 | **不接**常见 / 泄露密码黑名单 |

以下为当时的问题原文，留档：

| # | 问题 | 为什么要问 |
|---|---|---|
| **P1** | 「不设限流」+「重新申请会让旧码作废并清零错次」放在一起，等于**错 5 次的限制可以靠反复申请绕过**：申请 → 试 5 次 → 再申请 → 再试 5 次……6 位码 100 万种，脚本不停跑就能试出来，同时受害人邮箱会收到大量邮件。<br>选项：**a** 接受 / **b** 同一邮箱每小时最多申请 N 次（N 由你定）/ **c** 其他 | 第二轮「保留」保住了错 5 次，但对不设申请次数的组合后果没确认过 |
| **P2** | 重置 / 改密验证码邮件要不要计入每日发信预算（默认 100 封，和登录验证码、报价邮件共用 Resend 额度）<br>【现状】登录验证码只对**未注册**邮箱计预算；重置码只发给已注册账号，按现状规则就**不计**。<br>选项：**a** 不计（沿用现状规则）/ **b** 计 | 第二轮「保留」不确定指的是哪条规则 |
| **P3** | 是否接泄露 / 常见密码黑名单（NIST 要求） | 第一轮只答了「8位」，没提这一项 |

---

## 2. 流程

### 2.1 忘记密码（仅客户 / 供应商登录页）

```
登录页「忘记密码」→ /auth/forgot
  ① 输入邮箱 → POST /auth/password/forgot
     后端：查 external_user
       ├ 账号 ACTIVE 且组织 ACTIVE（有没有密码都算）→ 生成 6 位码，覆盖旧码（旧码作废、错次清零）→ 发邮件
       └ 不存在 / 禁用 / 组织停用                     → 不发
     两种情况响应完全一样：{sent:true}；发信走异步，耗时对齐（§8 R2）
  ② 同页第二步：输入 码 + 新密码 + 确认新密码 → POST /auth/password/reset
     后端：校验码（5 分钟、错 5 次作废、常量时间比较、用后即删）
          → 新密码 8～100 位、不能与当前密码相同（当前没有密码则跳过）
          → BCrypt 写入 → 吊销该用户全部 refresh token
          → 记邮箱已验证（码证明了邮箱归属，同验证码登录现有行为）
          → 发「密码已修改」邮件 → 签发新登录态返回
  ③ 前端拿到登录态，跳对应受众首页
```

### 2.2 已登录改密码（客户 / 供应商 / 运营）

```
设置页「登录密码」卡片 → 点「修改密码」→ 弹框（C7）
  ① 弹框里「发送验证码」→ POST /{端}/me/password/code → 发到账号邮箱
  ② 输入 码 + 新密码 + 确认新密码 → PUT /{端}/me/password
     后端：同 2.1 ② 的校验与写入 → 吊销该用户全部 refresh token（含当前设备）
          → 发「密码已修改」邮件 → 204
  ③ 前端清登录态 → 跳该受众登录页（客户/供应商 /auth/signin，运营 /auth/internal/signin）
```

- 卡片上**不显示**密码状态（「已设置」或 `******`）：没设过密码的账号显示 `******` 就是假内容（C5）。只放标题 + 「修改密码」按钮，profile 接口不加字段。
- 运营也走邮件验证码：码发到 `ops_user.email`。

---

## 3. 接口

### 3.1 公开端点（`/auth/**`，无 JWT，只有外部端）

| 方法 路径 | 请求体 | 响应 |
|---|---|---|
| `POST /auth/password/forgot` | `{email}` | `{sent: true}`（恒定） |
| `POST /auth/password/reset` | `{email, code, newPassword}` | `TokenResponse`（同登录） |

### 3.2 已登录端点（路径前缀即受众，同 `MeProfileController`）

| 方法 路径 | 请求体 | 响应 |
|---|---|---|
| `POST /customer/me/password/code`、`/supplier/…`、`/ops/…` | 无 | `{sent: true}` |
| `PUT /customer/me/password`、`/supplier/…`、`/ops/…` | `{code, newPassword}` | 204 |

用户 id、邮箱只从 principal 取，请求体不收身份字段（§3 铁律 3）。

### 3.3 i18n code（后端只返 code）

| code | 何时 |
|---|---|
| `auth.password_invalid`（现有） | 长度不在 8～100 |
| `auth.password_same_as_current`（新） | 与当前密码相同 |
| `auth.otp_code_invalid` / `auth.otp_expired` / `auth.otp_code_incorrect`（现有，复用） | 码格式错 / 过期或已作废 / 码错 |
| `auth.otp_send_failed`（现有，复用） | 发信失败 |

前端 zh / en 词条同步。

### 3.4 配置

不需要 `app.web.base-url`（验证码方案没有链接）。5 分钟、5 次沿用 `OtpService` 现有常量的取法，新增 `app.auth.password-code.*` 只在需要和登录码分开调时再加 —— 现在两者取值相同，**不新增配置**。

---

## 4. 数据存储 —— 不改表结构

| 数据 | 存哪 |
|---|---|
| 重置码（忘记密码） | Redis，复用 `OtpCodeStore` 的「码哈希 + 错次计数」两 key 结构，**用途单独命名空间**：`pwcode:reset:{邮箱 SHA-256}` |
| 改密码（已登录） | 同上，`pwcode:change:{受众}:{userId}` |
| 用户 → refresh token 索引 | 新增 Redis Set `refresh-index:{受众}:{userId}`，`issue / rotate / revoke` 同步维护；吊销全部 = 逐个删 + 删索引。TTL 与 refresh 一致 |
| 新密码 | 现有 `password_hash` 列 |
| 审计 | 结构化日志 `auth.password.code_send / reset / change`，结果码 + 打码邮箱，不记码、不记原始 IP（§6） |

**登录码、重置码、改密码三个命名空间必须分开**：否则登录码能拿来重置，重置码能拿来登录。
所有 key 走 `CacheKeys`。

---

## 5. 安全要点

1. 忘记密码申请：存在 / 不存在同一响应、同一耗时（异步发信）。
2. 码：`SecureRandom` 6 位，只存哈希（拌入标识），常量时间比较，用后即删，错 5 次作废（全部复用 `OtpService` 现有做法）。
3. 申请不锁号、不改账号状态（OWASP）。
4. 改密 / 重置 = 吊销该用户全部 refresh token。
5. 邮箱规整：trim + toLowerCase，与 `AuthService.normalize()` 同一套。
6. 重置接口只认 `external_user`；运营账号的邮箱打这个接口 → 和「不存在」同样处理。

---

## 6. 邮件文案草稿（待需求方审）

模板放 `resources/i18n/`，首行主题，其余正文；加载方式同 `OtpEmailTemplate`。语言：账号存的 locale 优先，其次 `Accept-Language`，最后英文。

**`password-code-email-zh.txt`**（忘记密码、改密码共用）
```
修改密码验证码
你正在修改登录密码，验证码是 {code}。

{minutes} 分钟内有效，只能用一次。
如果不是你本人操作，忽略这封邮件即可，你的密码不会被修改。
```

**`password-code-email-en.txt`**
```
Your password change code
You are changing your sign-in password. Your verification code is {code}.

It expires in {minutes} minutes and can only be used once.
If you did not request this, you can ignore this email. Your password will not be changed.
```

**`password-changed-email-zh.txt`**
```
你的登录密码已修改
你的账号登录密码刚刚被修改，所有设备都已退出登录。

如果是你本人操作，无需处理。
如果不是你本人操作，你的邮箱可能已被他人使用，请先确认邮箱安全，再重新设置密码。
```

**`password-changed-email-en.txt`**
```
Your sign-in password was changed
The sign-in password for your account was just changed, and all devices have been signed out.

If you made this change, no action is needed.
If you did not, someone may have access to your email. Secure your email first, then set a new password.
```

文案里**没有写客服联系方式**：系统里没有这项数据（NIST §4.6 要求通知里带联系方式，有了再加）。
「重新设置密码」对运营来说没有自助入口（运营登录页不加忘记密码），运营收到时只能找管理员 —— 运营是否要单独一版文案，审稿时一并定。

---

## 7. 前端

| 位置 | 改动 |
|---|---|
| `pages/auth/SignInPage.tsx` | 密码模式下加「忘记密码」→ `/auth/forgot` |
| 新 `pages/auth/ForgotPasswordPage.tsx` | 第一步输邮箱、发码（提示「如果该邮箱已注册，会收到验证码」）；第二步码 + 新密码 ×2；成功后存登录态、跳首页 |
| `router.tsx` | 新增 `/auth/forgot`（`/auth/**` 已被 `SpaForwardController` 转发，后端不用改） |
| `pages/AccountSettingsPage.tsx` | 新「登录密码」卡片 + 弹框（发码按钮、码、新密码 ×2）；成功后清登录态跳登录页 |
| `services/auth.ts` | `forgotPassword / resetPassword / sendMyPasswordCode / changeMyPassword`；三端路径表同 `PROFILE_PATH` 写法 |
| i18n 词条 | 页面文案 + §3.3 错误码 |

---

## 8. 风险

| # | 风险 | 状态 |
|---|---|---|
| R1 | 反复申请绕过错 5 次限制，可暴力试码 + 邮件轰炸 | 已接受（P1=a） |
| R2 | 只给已注册账号发信，同步发信的耗时会泄露账号是否存在 | 改异步发信。`NotificationService` 有没有现成异步出口**未核实**，实现前先看 |
| R3 | BCrypt 只认前 72 字节，最长 100 字符（多字节字符更早超）会被截断或报错 | Spring Security 当前版本对超长输入的行为**未核实**，实现第一步写测试确认；若是截断，要回来找你定 |
| R4 | 改密后旧 access token 最长 2 小时仍有效 | 已接受 |
| R5 | 发信额度被重置码挤占 | 已定不计预算（P2=a）；重置码只发已注册账号，量受账号数约束 —— **这是推导**，前提是 P1 不限次数下单个账号仍可被刷，额度仍可能被打满 |
| R6 | 重置后直接登录：拿到邮箱的人一步就进账号（与 OWASP 建议不同） | 已定，记录在案 |
| R7 | 改密码不验当前密码：邮箱被盗 = 账号被盗 | 已定（与忘记密码的能力相同，不额外扩大风险面）—— **这是推导**，前提是忘记密码流程本来就只凭邮箱 |
| R8 | 运营忘记密码没有自助渠道，后台也没有「管理员重置他人密码」 | 本方案不含，如需要另立需求 |

---

## 9. 测试计划

按 core.md：涉及安全代码 → 模块档 `mvn verify -Dit.test='com.mfg.platform.auth.**'`，提交前全量 `mvn verify`。

**单元（`*Test`）**
- 密码规则：7 / 8 / 100 / 101 位；与当前相同；当前无密码时不比较
- 三个命名空间互不通用：登录码不能重置、重置码不能登录
- 模板渲染：zh / en / 未知语言回退 en / 占位符

**集成（`*IT`，真 PostgreSQL + 真 Redis）**
- forgot：已注册 / 未注册 / 禁用 / 组织停用 / 运营邮箱 —— 响应完全一致，只有第一种写了码
- reset：正确码 → 返回登录态，旧密码登录失败、新密码登录成功；同一码再用 → `auth.otp_expired`；错 5 次后正确码也失败；重新申请后旧码失效
- 无密码账号经 reset 设上密码后，可用密码登录
- 重置 / 改密后：该用户此前所有 refresh token 刷新均 401；其他用户不受影响
- `/me/password`：三端各自成功；客户 token 打 `/ops/me/password` → 403 `common.wrong_portal`
- 改密后当前设备 refresh 也失效
- 「密码已修改」邮件已发出（断言通知调用，不 mock Redis）

前端：`npm run type-check`、`npm run build`，手工走一遍忘记密码和三端改密码。

---

## 10. 改动顺序（批准后）

1. R3：先写测试确认 BCrypt 超 72 字节的行为
2. `CacheKeys` + `RefreshTokenService` 用户索引 + 吊销全部（含测试）
3. 密码规则校验收成一处（`AccountAdminService#requirePassword` 共用，避免两套规则）
4. 验证码按用途分命名空间；`PasswordService`（发码 / 重置 / 改密）+ 控制器 + 模板
5. 前端页面、路由、设置页卡片、i18n
6. `3-changelog.md`

**不涉及 DDL、不新增配置。**
