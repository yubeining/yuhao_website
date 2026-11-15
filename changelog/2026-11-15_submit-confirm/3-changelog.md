# 变更记录 —— 提交确认弹层（2026-11-15）

## 改动

| 文件 | 改动 |
|---|---|
| `components/ConfirmDialog.tsx` | 新增通用确认弹层（标题 / 说明 / 取消 / 确认，busy 时禁用，Esc 关闭） |
| `OrderDetailPage` | 提交按钮改为打开确认弹层；确认后才调 `submitOrder` |
| `styles.css` | `.dlg-*` 样式（沿用 `.fp-overlay` 遮罩） |
| `i18n` | `submitConfirmTitle/Body/Cta` 三处文案 |

提交成功后仍保留「已提交，图纸版本已锁定」的 banner —— 它现在解释的是**当前状态**
（为什么页面只读），不再承担"事前告知"。

## 验证（真跑）

```
点提交 → dialog = "Submit this order? | Drawing revisions of every part will be locked… | Cancel | Submit"
点取消 → dialog = 0，状态 = Draft
再点提交 → 确认 → 状态 = Submitted
```
