# 变更记录 —— 门户 UI/UX 第二批修复

## 改动

| # | 文件 | 改了什么 |
|---|---|---|
| 1 | `auth/SignInPage.tsx`、`auth/OpsSignInPage.tsx`、`auth/RegisterPage.tsx`、`strings.ts` | 去掉所有输入框底纹；删 `login`/`register` 的 `codeP` |
| 2 | `customer/OrderDetailPage.tsx` | 交期「必填」只在草稿时显示 |
| 3 | `ops/PartiesPage.tsx`、`strings.ts` | 删除过时的 `parties.emptySub` |
| 4 | `ops/AccountsPage.tsx`、`ops/QuoteSettingsPage.tsx`、`strings.ts` | 列表三态；有筛选条件时空结果显示 `common.noMatch`；数据未到时不显示计数；删 `noUsersSub` |
| 5 | `components/AppShell.tsx`、`styles.css` | 导航文字包进 `.lb`、加 title；< 900px 图标栏 |
| 6 | 11 个列表页（含 DispatchPage 两处） | 翻页不再手动 load |
| 7 | `components/ui.tsx` + 9 处 | 新增 `Pending`；列表页顶部错误横幅只在数据已到时显示，避免和 Pending 重复 |
| 8 | `styles.css`、`components/ui.tsx`、`ops/AccountsPage.tsx` | 警告横幅样式与 `role="alert"`；组织 / 运营账号弹框内显示错误 |
| 9 | `components/AppShell.tsx`、`router.tsx` | 供应商导航去掉对账 / 资料；`/supplier/bill`、`/supplier/profile` 重定向 |
| 10 | `components/AppShell.tsx` | 公司名读失败不再提示「未完善」；链接改到 /customer/settings |

## 验证

- `npm run type-check` exit 0；`npm run build` exit 0
- `.githooks/pre-commit` 见提交
- 线上实测（待做）

## 遗留项

- `supplier/BillPage.tsx`、`supplier/ProfilePage.tsx` 及其文案、`nav.supplier.bill/profile/settlement/company`
  仍在代码里（需求方要求保留以便后端做好后放回）
- 第三批未开始
