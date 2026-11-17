# 实施计划（2026-11-17 批准）

| # | 改法 |
|---|---|
| 1 | 新增 `components/useDialog.ts`：打开时聚焦第一个可聚焦元素、Tab 循环、关闭归还焦点；模块级栈保证 Esc 只关最上层；首个浮层锁 body 滚动、最后一个关闭时还原。Modal / ConfirmDialog / FilePreviewModal 改用它并补 `aria-labelledby`；ConfirmDialog 叠在 Modal 之上（z-index 80） |
| 2 | `form.tsx`：Field 用 `useId` 生成 id 经 context 交给 Input，`<label htmlFor>` 自动对上；ErrMsg 加 role=alert；新增 `Form`（阻止默认提交、回车触发 onSubmit）。三个登录 / 注册页包进 Form，主按钮 type=submit |
| 3 | 表格单元格加 `data-label`；`TableWrap className="stack"`；`@media (max-width:760px)` 下 tr/td 变块级、td::before 显示列名、按钮最小高度 36px |
| 4 | QuotesPage：`?tab=&page=`；DispatchPage：`?pp=&op=`；点进详情 `navigate(..., { state: { back } })`，详情页返回链接优先用 back（限同前缀），否则回列表首页 |

## 未采用

- 筛选存 sessionStorage：刷新可保留，但链接转发不带筛选、多标签页互相覆盖
- 详情页「返回」用 history.back()：直接打开详情链接时会退出站点
