# 线上流程测试发现的问题 —— 变更记录

## 改动

- `portal/src/components/DatePicker.tsx`：弹层下方放不下翻到上方，都放不下贴视口底边；按渲染后的真实高度定位。
- `portal/src/pages/supplier/OrdersPage.tsx`：开工、完工先弹确认框。
- `portal/src/pages/ops/ProdPage.tsx`：建合同先弹确认框。
- `portal/src/i18n/strings.ts`：三条确认文案（中英）。
- `backend/.../platform/auth/AuthService.java`：账号没存语言不再兜底 `en`。
- `backend/.../platform/auth/JwtService.java`：locale 为 null 时 token 不写这一项。
- `portal/src/auth/session.ts`、`portal/src/services/auth.ts`：`locale` 类型改成 `string | null`。
- `backend/src/test/.../platform/auth/MeLocaleIT.java`：新增两条 —— 没存语言登录返回 null 且 token 不带 locale（改前失败，返回 `en`）；存了 `zh` 登录返回 `zh`。

## 验证

- `MeLocaleIT` 新测试改前失败、改后通过；`AuthFlowIT`、`OtpLoginFlowIT` 通过。
- `mvn verify`：单元 124、集成 166 全过（5 个跳过）。
- `npm run build`（含 `tsc -b`）通过。
- 本地浏览器：
  - 没设语言的客户账号登录，session 里 locale 为 null，页面按浏览器语言（en-US）显示；
  - 日期弹层三种情况都量过位置：正常放下方；下方放不下翻上方；窗口 560 高上下都放不下时贴底，整张日历在视口内。
- **未在浏览器里点过三个确认框**：本地库没有已签合同的供应商订单，造一张要走完整下单—报价—派单—签字流程。改动是给已有按钮套上页面里已在用的 `useConfirm`，类型检查通过。

## 已知代价 / 遗留

- 已经登录的人手里的旧 token / session 仍带 `en`，重新登录（或 token 刷新）后才跟浏览器。
- 浏览器本身是英文的人仍然看英文，这是选定的行为；可以点右上角切换，手选会存进账号。
- 发货给客户还没有，客户订单停在 READY。

## 部署清单

- 无迁移，无新增环境变量。
