# 变更记录 —— 前端拆内外登录页 + 接真后端(mock→real 第一块)

> 2026-09-08 ｜ 前端 auth 迁移 + 后端外部登录微调 ｜ 无 schema

## 背景

前端是 mock 原型(33 个文件走 mock),登录也是共用一个入口的 mock。本轮把<b>认证</b>这块
从 mock 迁到真后端,并按后端的内外分离拆成两条独立 URL。页面内容(订单/报价等)仍走 mock,
按域逐步迁移。

## 后端(微调)

- **外部登录只凭账号 + 密码**:`/auth/login` 去掉 `portalType` —— external_user 的 email 全局唯一,
  受众(客户/供应商)由账号所属组织的 type 推出,不让用户先选自己是谁。运营账号不在 external_user 表,
  自然登不进外部入口。限流 key 改为按账号。`AuthService.authenticateExternal(account, password)`。

## 前端

- **拆成两条独立登录 URL(页面不混)**:
  - 外部 `SignInPage @ /auth/signin`:客户/供应商,邮箱+密码 → `/auth/login`;底部加"内部员工?从这里登录"。
  - 内部 `OpsSignInPage @ /auth/internal/signin`(新):运营专用,极简、无注册、无第三方登录 → `/auth/internal/login`。
- **接真后端**:`services/auth.ts` 实装 externalLogin / opsLogin / register / logout(走唯一 HTTP 收口 core/http);
  客户 `RegisterPage` → `/auth/register`(注册与登录解耦,建号后回登录页)。
- **登录态改真实**:登录成功写 `auth/session.ts`(加 refreshToken 字段);`PortalGuard` / `RootRedirect`
  从 mock 身份切到真实 session(判断逻辑不变,受众→落地页);未登录按受众去对应登录页(内部去 /auth/internal/signin)。
- **AppShell 用户菜单**:身份显示优先真实 session.displayName,退出登录调后端 `/auth/logout` 撤销 refresh + 清本地。
  身份切换是 mock 原型专属,真实登录态下暂不提供。

## 明确保留 mock(下一步按域迁)

- 各端页面的业务数据(订单/报价/派单…)仍是 mock;shell 在无 mock 用户时优雅降级(用真实 session 身份)。
- 供应商注册向导(重 KYC)未接后端(后端注册是极简版,KYC 字段缓办);邀请/验证页仍 mock。

## 验证

- 后端 `mvn verify` 绿(21 单测 + 22 集成,含 AuthFlowIT);前端 `type-check` + `build` 均通过。
- 本地真机联调(dev server 5173 → proxy → 后端 3001,库 mfg_demo):
  客户注册页填表 → 真建库(organization + external_user 各 1 行)→ 回登录页 → 登录 → 落到 CUSTOMER 端,
  顶栏显示真实身份 "Alice";内部登录页独立渲染。

## 部署清单

- 无迁移。外部登录去掉 portalType 是**破坏性接口变更**,但目前只有本仓库前端在用,同一次一起改完,无外部消费方。
- 运营端要能真正登录,需先有运营账号(内部开通/种子,尚未做)。
