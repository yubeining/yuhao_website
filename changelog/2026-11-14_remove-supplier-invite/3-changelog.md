# 变更记录 —— 下线供应商邀请入口与页面（2026-11-14）

## 功能

- 登录页删除「收到供应商邀请？从邀请链接入驻」入口
- 删除 `/auth/invite` 路由与 `InvitePage`（127 行）
- 删除 `/ops/onboarding` 路由、运营导航「入驻」分组与 `OpsOnboardingPage`（154 行）
- 服务层删除 5 个邀请相关函数与 2 个类型（`SupplierInviteCheck`、`SupplierInviteView`、`SupplierInviteStatus`）
- i18n 删除 `login.invited/invitedA`、`nav.ops.onboarding/supplierOnboarding`、
  `invite.*`、`ops.onboarding.*`（中英各一套，含 `Strings` 类型声明）

净变更：8 个文件，-439 行 / +2 行。

## 部署清单

- 仅前端：`cd portal && npm run build`（产物进 `backend/src/main/resources/static/`）
- **无迁移、无后端代码改动**，后端接口 `OpsSupplierInviteController` 与
  `/auth/supplier-invites/**` 保持原样
- 部署后 `/auth/invite`、`/ops/onboarding` 会落到 404 页（SPA 的 `*` 路由）

## 验证

- `npm run type-check` 通过（exit 0）
- `npm run build` 通过，`index-*.js` 由 488.91 kB 降到 477.09 kB
- `python3 scripts/check-i18n-literals.py` 通过

## 遗留项

1. `e2e/e2e-main.mjs:199` 仍在访问 `/ops/onboarding`，e2e 主流程第 20 步会失败，需要改
2. `ops.parties.emptySub`（中英）仍写着「在『供应商入驻』发邀请……」，指向已删页面
3. `mock/actions.ts` 的 `invite()` 与 `MockState.invites` 已无调用方，未清理
4. 后端邀请接口保留但无 UI 入口；以后要么补回入口，要么单独排期下线
