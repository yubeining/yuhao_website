# 变更记录 —— 门户 UI/UX 第一批修复

## 改动

| # | 文件 | 改了什么 |
|---|---|---|
| 1 | `supplier/HallDetailPage.tsx`、`supplier/OrdersPage.tsx` | 图纸按钮不再禁用；PDF / 图片开预览，其余格式点击直接下载（复用页面已有的 `download()`） |
| 2 | `router.tsx`、删 `ops/OrdersPage.tsx` | 删掉 mock 页；`/ops/orders` 重定向到 `/ops/quotes`（和计划的「删路由」略有出入：沿用路由表「旧链接不留 404」的惯例） |
| 3 | `customer/QuoteDetailPage.tsx`、`strings.ts` | 确认报价前弹 ConfirmDialog（新增 `confirmTitle` / `confirmBody` / `confirmCta`，中英） |
| 4 | `customer/OrderDetailPage.tsx` | 「报价已出」横幅用 `fmtMoney`；无总价退回 `quotedBanner` |
| 5 | `i18n/errorText.ts` | 兜底文案默认 `t.common.actionFailed` |
| 6 | `strings.ts` | `statusConfirmed` → 已确认报价；供应商 `SHIPPED` → 已发出 · 待平台质检（中英） |
| 7 | `supplier/OrdersPage.tsx` | 有 `signedAt` 显示签字时间；签字期限只在 ACCEPTED / CONTRACT_PENDING |
| 8 | `ops/QuoteWorkPage.tsx`、`strings.ts` | 列出一行的全部图纸；删掉不再使用的 `viewDrawing` / `viewDrawings` |
| 9 | `ops/AccountsPage.tsx` | 三个 tab：输入与已生效条件分开，回车 / 查询才生效并回第 1 页；机构类型切换回第 1 页 |
| 10 | `ops/PartiesPage.tsx`、`strings.ts` | 已设折率不能清空（新增 `errDiscountRequired`）；弹框内显示错误 |
| 11 | `ops/DispatchPage.tsx`、`ops/QuoteWorkPage.tsx`、`customer/status.ts`、`ops/dispatchStatus.ts` | 状态标签走 `(t)` 版本；删掉因此无人引用的 `ORDER_ST` / `QUOTE_ST` / `OPS_ORDER_ST` / `DISPATCH_MODE` |
| 12 | `services/core/http.ts`、`auth/session.ts`、`auth/SignInPage.tsx`、`auth/OpsSignInPage.tsx` | 强制登出按 partyType 去对应登录页；新增 `landingAfterSignIn` 统一回跳校验（本端前缀 + 拒绝 `//`），两个登录页都读 `state.from` 和 `callbackUrl` |
| 13 | `auth/SignInPage.tsx` | 默认验证码模式 |
| 14 | `auth/SignInPage.tsx`、`strings.ts` | 删掉员工登录入口及 `staffPrompt` / `staffLink` |

## 验证

- `cd portal && npm run type-check` —— exit 0
- `cd portal && npm run build` —— exit 0
- `.githooks/pre-commit` —— 见提交记录
- **未做**：交互效果没有在浏览器里实测。portal 无单元测试框架；e2e 需要本地后端（JDK 25，本机没有）。
  上线后需按 1–14 逐条点检。

## 遗留项

- 删除 `/ops/orders` 后，`mock/actions.ts` 的 `deliver` / `custPaid`、`customer/status.ts` 的 `ORD_ST`
  不再有页面使用；属于 mock 层清理，本次未动
- 第二批（确认弹框统一、加载/错误/空状态、翻页双请求、Banner 样式、mock 页面、手机端等）未开始
