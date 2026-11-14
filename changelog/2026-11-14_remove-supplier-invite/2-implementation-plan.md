# 实施计划 —— 下线供应商邀请（2026-11-14）

## 必须做

1. 登录页：删掉「收到供应商邀请？」那一行（`SignInPage.tsx`）
2. 路由：删 `/auth/invite`、`/ops/onboarding` 两条路由及对应 import（`router.tsx`）
3. 页面：删 `pages/auth/InvitePage.tsx`、`pages/ops/OnboardingPage.tsx`
4. 运营导航：删「入驻 / 供应商入驻」分组（`AppShell.tsx`）
5. 服务层：删 `checkSupplierInvite` / `registerWithSupplierInvite`
   （`services/auth.ts`）、`createSupplierInvite` / `listSupplierInvites` /
   `revokeSupplierInvite` 及其类型（`services/ops/suppliers.ts`）
6. i18n：删 `login.invited/invitedA`、`nav.ops.onboarding/supplierOnboarding`、
   `invite.*`（中英）、`ops.onboarding.*`（中英），类型声明同步删

## 可以延后

- 后端 `OpsSupplierInviteController` / 公开的 supplier-invite 端点：保留，无 UI 调用
- `e2e/e2e-main.mjs:199` 仍会访问 `/ops/onboarding`，下次跑 e2e 前要改
- `mock/actions.ts` 的 `invite()` 是原型 mock 层遗留，当前无调用方

## 被否决的方案

- **只删登录页入口、保留 `/auth/invite`**：需求方明确要求页面也删。
- **把页面改成真能用的注册页**：页面本来就是真的，问题不在功能而在流程被下线。
- **顺带删后端接口**：需求方只说 UI，后端接口删除属于另一个决定，且会牵涉迁移与测试。
