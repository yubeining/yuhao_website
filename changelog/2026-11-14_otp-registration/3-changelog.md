# 变更记录 —— 验证码注册（2026-11-14）

## 功能

- 注册页只保留「企业邮箱 / 验证码 / 条款勾选」，去掉联系人姓名、密码、国家
- 新增 `POST /api/v1/auth/register/otp`：校验并消费验证码 → 建组织 + 用户 → 直接签发登录态
- 建出的账号 `password_hash` 为空、`email_verified_at` 有值、显示名为邮箱前缀
- 旧 `POST /auth/register`（密码注册）保留，未删除

## 后端改动

| 文件 | 改动 |
|---|---|
| `OtpService` | 抽出 `consume()`；新增 `verifyRegistration()` |
| `IdentityService` | 新增 `registerVerifiedEmail()` |
| `ExternalAuthController` | 新增 `/register/otp` 端点，注入 `OtpService` |

## 前端改动

| 文件 | 改动 |
|---|---|
| `pages/auth/RegisterPage.tsx` | 重写：发码 + 倒计时 + 验证码 + 条款 |
| `services/auth.ts` | 删 `register`/`RegisterInput`，加 `registerWithCode` |
| `i18n/strings.ts` | `reg.*` 增删对应键（中英） |

## 验证（本地真跑，不是推断）

用本地 SMTP 接收器（`smtp-sink.py`，2525 端口）+ `MAIL_HOST=127.0.0.1` 起后端：

1. `POST /api/v1/auth/otp/send` → 200 `{"sent":true}`，收到邮件，码 `185348`
2. `POST /api/v1/auth/register/otp` → 200，返回 accessToken/refreshToken，
   `portalType=CUSTOMER`、`displayName=otp-check`（邮箱前缀）
3. 库校验：`organization`(CUSTOMER, name/country 为空) + `external_user`
   (`password_hash is null` = t, `email_verified_at` 非空)
4. 重复注册 → 409 `auth.email_taken`
5. 错码 → 400 `auth.otp_expired`（码已被上一步消费）

另有：`mvn test` 80 通过 0 失败；`npm run type-check`、`npm run build` 通过。

## 部署清单

- 后端要重新构建（新增端点）
- 前端 `npm run build`
- 无迁移、无配置变更

## 遗留项

1. **验证码注册的账号没有密码**，密码登录对它们只会得到 401 —— 前端登录页默认仍是密码模式，
   这类用户要先切到验证码。是否把登录页默认改成验证码模式，需求方还没定
2. 注册页仍有「条款勾选」，文案是原型里的，正式条款文本未接入
3. 与 `feat/country-iso-codes` 分支在 `RegisterPage.tsx` 上冲突：那个分支在国家下拉上改动，
   这个分支把国家整个去掉 —— 合并时应保留本分支版本（国家仍用于运营端建组织）
