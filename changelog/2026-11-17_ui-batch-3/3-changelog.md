# 变更记录 —— 门户 UI/UX 第三批修复

## 改动

| # | 文件 | 改了什么 |
|---|---|---|
| 1 | `components/useDialog.ts`（新）、`Modal.tsx`、`ConfirmDialog.tsx`、`FilePreviewModal.tsx`、`styles.css` | 统一对话框行为；预览弹层补 `role="dialog"`；`.fp-overlay.dlg-mask` z-index 80 |
| 2 | `components/form.tsx`、`auth/SignInPage.tsx`、`auth/OpsSignInPage.tsx`、`auth/RegisterPage.tsx` | 标签关联、`role="alert"`、`Form` 外壳、回车提交 |
| 3 | `supplier/OrdersPage.tsx`、`supplier/HallDetailPage.tsx`、`styles.css` | `data-label` + `.tw.stack` 窄屏卡片 |
| 4 | `ops/QuotesPage.tsx`、`ops/DispatchPage.tsx`、`ops/QuoteWorkPage.tsx`、`ops/ProdPage.tsx` | 筛选 / 页码进网址；返回链接回到原列表 |

## 验证

- `npm run type-check` exit 0；`npm run build` exit 0
- `.githooks/pre-commit` 见提交
- 线上实测（待做）

## 遗留项

- DatePicker、select、CountrySelect 没有接 Field 的 id（只有 Input 接了），这些字段的标签仍未关联
- 派单批量操作、AccountsPage 拆分 —— 另开一批
