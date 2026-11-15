# 变更记录 —— 删除运营工作台（2026-11-15）

## 改动

| 文件 | 改动 |
|---|---|
| `pages/ops/DashboardPage.tsx` | 删除 |
| `services/ops/dashboard.ts` | 删除（连同 `services/index.ts` 的导出） |
| `router.tsx` | 删 dashboard 路由；`/ops` 与旧的 `/ops/dashboard` 都重定向到 `/ops/quotes` |
| `AppShell` | 运营侧边栏去掉「总览」分组与「工作台」项 |
| `auth/session.ts` | 运营登录落点 `/ops/dashboard` → `/ops/quotes` |
| `OpsDashboardController` | 删除 |
| `CustomerOrderRepository` / `OpsOrderRepository` | 删除只被它用到的 `countByStatus` |
| `i18n` | 删除 `ops.dashboard.*` 与 `nav.ops.overview/dashboard` |

## 验证（真跑，本地起运营账号）

```
运营登录落点 = /ops/quotes
导航分组 = ["询价与报价","执行","主数据"]      ← 没有「总览」
旧路径 /ops/dashboard → /ops/quotes            ← 重定向，不 404
mvn test 92 通过
```
