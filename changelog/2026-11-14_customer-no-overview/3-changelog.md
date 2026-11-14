# 变更记录 —— 去掉概览 + 建单直达（2026-11-14）

## 功能

- 删除客户端概览页 `HomePage.tsx`，`/customer` 直接重定向到 `/customer/orders`
- 客户导航移除「概览」，登录落点改为 `/customer/orders`
- 新增 `/customer/orders/new`：点「新建订单」直接进表单（列表页/空态入口都指向它）
- 订单列表页删除内联建单表单及相关状态

## 影响文件

| 文件 | 改动 |
|---|---|
| `pages/customer/NewOrderPage.tsx` | 新增 |
| `pages/customer/HomePage.tsx` | 删除 |
| `pages/customer/OrderListPage.tsx` | 去掉内联表单，改链接 |
| `router.tsx` / `AppShell.tsx` / `auth/session.ts` | 路由、导航、登录落点 |
| `i18n/strings.ts` | 删 `customer.home.*`、`nav.customer.overview` |

## 验证（真跑）

Playwright 实测：

```
nav = [Orders, Quotes, Settings]        ← 没有概览
landed on = /customer/orders             ← 登录直接进列表
click 新建订单 → /customer/orders/new    ← 直达，期间 list GET = 0
create → /customer/orders/{id}           ← 建完直接进详情
```

`type-check`、`build` 通过。概览删除后 bundle 481.82 → 480.67 kB。

## 遗留项

- 「概览该给客户看什么」尚未定义；以后若要加，应该做待确认报价/进行中订单这类汇总，
  不能再复制一份订单列表
- 路由未按页拆包（单包 480KB），首屏可以再优化；本次未动
