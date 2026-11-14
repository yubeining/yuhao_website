# 变更记录 —— 订单详情字号统一（2026-11-15）

## 改动

- 「订单信息」卡不再混用 `Fld`：统一 `Field` + 纯文本 `.ro`（14px、tabular-nums），
  标签统一 12.5px 常规
- 布局：第一行「名称 / 期望交货日期」，第二行「零件数 / 总件数 / 建单日期 / 提交时间」（`.f4row` 四列）
- 提交按钮文案固定 `提交订单`；禁用原因（`先添加至少一个零件` / `还有 N 个零件缺图纸`）
  移到按钮左侧的灰字
- i18n：`submitOrder(n)` 改为 `submit`；`needParts` 文案改为「先添加至少一个零件」

## 验证

Playwright：按钮文本恒为 `Submit order`、禁用时左侧出现 `Add a part first`；
截图确认六项标签同字号、只读值 14px 与输入框一致。

## 顺带补交

`changelog/2026-11-15_part-form-copy/` 上次提交时漏加了（`git add` 只加了 `portal/src`），
这次一起补上。
