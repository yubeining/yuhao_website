# 变更记录 —— 原生确认框换成页面弹框

## 改动

| 文件 | 改了什么 |
|---|---|
| `components/ConfirmDialog.tsx` | `title` 可选、`danger` 选项；新增 `useConfirm()` |
| `styles.css` | `.btn.pri.danger` 警示色 |
| `i18n/strings.ts` | `common.ok`（确定 / OK） |
| `supplier/OrdersPage.tsx` | 签字、撤回（警示）、发货 |
| `supplier/HallDetailPage.tsx` | 接单、拒接（警示） |
| `ops/ProdPage.tsx` | 派单、挂市场、收回 / 取消合同 / 撤销供应商 / 取消分配（警示） |
| `ops/AccountsPage.tsx` | 三个 tab 的停用（警示） |
| `ops/ProductionPage.tsx` | 质检提交 |
| `ops/QuoteWorkPage.tsx` | 发出 / 重新发出报价 |
| `customer/QuoteDetailPage.tsx` | 拒绝报价（警示） |
| `customer/OrderListPage.tsx` | 删除草稿订单（警示） |
| `customer/PartFormPage.tsx` | 放弃未保存修改（警示） |

## 验证

- `npm run type-check` exit 0；`npm run build` exit 0；`grep -rn "window.confirm" portal/src` 只剩注释
- `.githooks/pre-commit` 见提交
- 上线后在应用内置浏览器里实点「重新发出报价」等动作确认弹框出现（待做）

## 遗留项

- 弹框仍无焦点陷阱 / 焦点归还，三种浮层（Modal / ConfirmDialog / FilePreviewModal）未统一 —— 第二批
