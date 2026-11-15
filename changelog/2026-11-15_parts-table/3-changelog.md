# 变更记录 —— 零件表列与行距（2026-11-15）

## 改动

| 项 | 改前 | 改后 |
|---|---|---|
| 图纸列 | 文件数（`1 / —`） | `● 已上传` / `● 未上传`（颜色点区分） |
| 状态列 | `图纸已传 / 缺图纸` pill | 删除（草稿没有零件状态） |
| 卡头提示 | `1 缺图纸` pill | 删除（与顶部 banner 重复） |
| 行距 | `td` 12px、表头更小 | `td` 15px、表头 11px（`.partsTable`） |
| 删除操作 | `btn qui sm` 按钮 | 行尾文字按钮（次级色） |

同时给 `TableWrap` 加了可选 `className`，用于局部表格样式，不改全局 `td`。

## 验证（真跑）

建了两个零件（一个传了 PDF、一个没传），表头与状态确认：

```
headers = # | DRAWING NO. | NAME | REV | MATERIAL | QTY | DRAWING |
drawing cells = Drawing attached | No drawing
```

`type-check`、`build` 通过。

## 遗留

- 顶部 banner 与提交按钮旁提示都在说缺图纸，语义不重复但存在两处；后续可只留一处
