# 线上流程测试发现的问题 —— 方案

## 1. 日期弹层

`components/DatePicker.tsx`：抽出 `place()`，量弹层真实高度后决定位置 ——
下方放得下放下方，否则上方放得下放上方，都放不下贴视口底边。
第一次打开时弹层还没渲染、量不到高度，用 `useLayoutEffect` 在绘制前按真实高度再定一次。

## 2. 确认框

沿用页面已有的 `useConfirm`：

- `pages/supplier/OrdersPage.tsx`：开工、完工；
- `pages/ops/ProdPage.tsx`：建合同；
- `i18n/strings.ts`：`supplier.orders.startConfirm / producedConfirm`、`prodDetail.confirmCreateContract`（中英）。

文案只写代码里能核实的事实：开工 / 完工没有撤回接口；合同签字前可以作废（已有「作废合同」）。

## 3. 语言

- 后端 `AuthService.localeOr` 不再兜底 `en`，没存就是 null；`JwtService` 在 locale 为 null 时不写这一项。
- 前端 `Session.locale`、`TokenResponse.locale` 改成 `string | null`；`detect()` 本来就会在没有账号语言时用浏览器语言。
- 核过影响面：后端只有 token / 登录响应用到 principal 的 locale；邮件模板直接读用户表，不受影响。

## 被否决的方案

- 邀请注册的供应商默认存 `zh`：本人选了「没存就跟浏览器」，对所有受众生效。
- 弹层只做「翻到上方」：本地实测窗口 560 高时上下都放不下，仍会被裁，所以加了贴底兜底。
