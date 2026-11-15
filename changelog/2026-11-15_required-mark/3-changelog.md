# 变更记录 —— 必填标记统一（2026-11-15）

## 改动

| 文件 | 改动 |
|---|---|
| `components/form.tsx` | 新增 `Req` 组件；`Field` 增加 `required` 属性，统一渲染星号 + 读屏文案 |
| `styles.css` | `.req`（红 *）、`.sr-only`（读屏专用） |
| `PartFormPage` | 图号 / 名称 / 数量改用 `required`；图纸标题用 `<Req />` |
| `i18n` | `fldCode` 去掉字符串里的 ` *`；新增 `common.required` |

## 为什么不用「拼字符串」

星号写进 i18n 文案里，颜色和间距就没法统一，读屏也只会念出一个「星号」；
抽成组件后，样式和可访问性只有一处定义。

## 验证（真跑）

```
required marks = Drawing no.*required | Name*required | Qty*required | Drawings*
                 → 全部 rgb(166, 45, 34)   ← var(--bad)
```

`type-check`、`build`、i18n 检查通过。

## 遗留

- 其它页面如果有必填字段，后续也改用 `Field required`（本次只覆盖零件表单）
