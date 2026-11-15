# 变更记录 —— 客户侧边栏去掉分组标题（2026-11-15）

## 改动

| 文件 | 改动 |
|---|---|
| `AppShell.tsx` | `customerNav` 里删掉 `{ sec: t.nav.customer.trade }`，并写清为什么客户侧不分组 |
| `i18n` | 删除 `nav.customer.trade`（中英各一处，类型也去掉） |

## 验证（真跑）

```
section labels = []          ← 侧边栏不再有分组标题
导航项 = 我的订单 / 我的报价 / 设置
```

`type-check`、`build` 通过。
