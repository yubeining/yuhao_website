# 实施计划（2026-11-17 批准）

1. `ConfirmDialog` 加 `danger`（警示色确认按钮），`title` 改为可选
2. 新增 `useConfirm()`：返回 `[askConfirm, confirmDialog]`，`await askConfirm(msg)` 得到 true/false，
   每处调用点只需把 `window.confirm(msg)` 换成 `await askConfirm(msg)`，文案不动
3. 9 个页面 19 处替换；所在处理函数改为 async；页面末尾渲染 `{confirmDialog}`
4. `strings.ts` 加通用 `common.ok`（确定 / OK）；`styles.css` 加 `.btn.pri.danger`

警示色的判定：停用账号 / 机构 / 运营账号、撤回接单、拒接、收回派单、取消合同、撤销供应商、
取消分配、删除草稿订单、拒绝报价、放弃未保存修改。

## 未采用

- 每处单独维护一个 open 状态 + 一个 `<ConfirmDialog>`：19 处各加 state 和 JSX，改动面大且容易漏
- 命名用 `confirm`：客户报价页已有同名函数（确认报价），统一叫 `askConfirm`
