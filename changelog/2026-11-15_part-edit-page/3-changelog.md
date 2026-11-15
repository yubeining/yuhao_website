# 变更记录 —— 编辑零件页优化（2026-11-15）

## 改动

| 项 | 改前 | 改后 |
|---|---|---|
| 返回链接 | `← 订单标题` | `← 返回订单`（订单名放 title） |
| 标题副行 | `第 1 版` | `ED-1 · 第 1 版`（图号从表单移到这里） |
| 图号字段 | 只读文本，占一列 | 编辑态不再显示；仅新增时可填 |
| 图纸说明 | 静态「订单提交前…」 | 动态：已上传 N / 待上传 N / 未上传 |
| 保存按钮 | 永远可点 | 无改动时禁用 |
| 返回 | 直接跳走 | 有改动时确认「放弃未保存的修改？」 |

## 顺带修掉的 UI bug

`.btn:disabled{opacity:.38}` 把整颗按钮（含文字）一起透明，浅色主题下禁用按钮
只剩一个空框 —— 截图验证时发现「保存修改」看着是空白按钮。改成中性底色 + 次色文字
（`.btn.pri:disabled` 单独覆盖）。这个修复对全站所有禁用按钮生效。

## 验证（真跑）

```
back link = ← Back to order
subtitle = ED-1 · Rev 1
labels = Name * | Qty * | Material | Surface finishing   ← 图号已移出
drawing status = Not uploaded yet — required before submitting the order
save disabled (no change) = true
save disabled after change = false
```

`type-check`、`build` 通过。

## 遗留

- 新增零件页仍有「添加后进入零件详情」的灰字，编辑页没有对应说明（行为不同：编辑是回订单）
