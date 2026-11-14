# 变更记录 —— 添加零件表单去占位符（2026-11-15）

## 改动

| 位置 | 改前 | 改后 |
|---|---|---|
| 图号 | 占位符「可从文件名自动识别」 | 无 |
| 名称 | 无星号 | `名称 *` |
| 材料 / 表面处理 | 占位符「可不填」 | 无 |
| 数量 | 占位符「件」 | 无 |
| 图纸说明 | 一段 hint 文案 | 删除（只留标题 + 选择图纸按钮） |
| 空图纸提示 | 「还没有图纸」 | 删除（空就是空） |
| 主按钮 | 「加进订单」 | 「添加」 |
| 空态入口 | 「＋ 录入零件」 | 「＋ 添加零件」 |

i18n 同步删除 `codePlaceholder` / `optionalPlaceholder` / `hintNew` / `hintLocked` /
`hintRequired` / `noDrawing`（中英各一套）。

## 验证（真跑）

Playwright 打开 `/customer/orders/{id}/parts/new`：

```
placeholders = ["","","","",""]        ← 没有任何占位符
labels = Drawing no. * | Name * | Qty * | Material | Surface finishing
attach hints = 0                        ← 图纸区没有说明文字
```

`type-check`、`build` 通过。

## 遗留

- 「按文件名自动识别图号」没有实现；以后要做应单独做功能，不要写回占位符
- 必填校验失败时仍提示「图号、名称、数量为必填」，这条保留（用户需要知道原因）
