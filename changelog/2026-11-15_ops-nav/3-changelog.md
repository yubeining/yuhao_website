# 变更记录 —— 运营侧边栏两级化（2026-11-15）

## 新结构

```
业务            报价 / 派单管理 / 生产与质检 / 客户订单
主数据          供应商
账号管理        外部用户 / 组织 / 运营账号      ← 二级
```

- 顺序按活儿发生的顺序（报价 → 派单 → 生产 → 客户订单）
- `交易方` → `供应商`（页面里就只有供应商）
- `账号管理` 从「主数据」挪到自己的二级组

## 改动

| 文件 | 改动 |
|---|---|
| `AppShell` | `NavItem` 增加 `children`，`SideNav` 渲染缩进子项；运营导航重排 |
| `router` | 新增 `accounts/users|orgs|staff`；`/ops/accounts` 重定向到 `/users` |
| `AccountsPage` | tab 由 URL 决定，删掉页内切换按钮 |
| `i18n` | `nav.ops` 重命名（business / customerOrders / suppliers）；删掉 overview/dashboard/quoting/execution/parties/orders |
| `styles.css` | `.subnav` / `.it.sub` |

## 验证（真跑，本地运营账号）

```
登录落点 = /ops/quotes
分组 = ["业务","主数据"]
导航 = 报价 | 派单管理 | 生产与质检 | 客户订单 | 供应商 | 账号管理
        └ 外部用户 | 组织 | 运营账号
/ops/accounts → /ops/accounts/users
/ops/accounts/orgs → 卡片头 "Organizations"（刷新后仍是 Organizations）
/ops/accounts/staff → 卡片头 "Staff accounts"
```

## 待定

- **客户订单页仍是原型假数据**（`state.db.orders` + PrototypeBanner）。入口暂时保留，
  等接真接口或确认撤掉再动 —— 这个需要需求方拍板
- 派单管理仍是一页两段（待派池 + 生产订单列表），按要求没有拆页

## 补充：撤掉「客户订单」入口

需求方确认：假数据入口先撤掉。

- 侧边栏删掉「客户订单」一项（`nav.ops.customerOrders` 一并删除）
- 页面与路由 `/ops/orders` **暂时保留**（还能直接输 URL 打开，带原型提示条）——
  等接真接口或决定重做时再处理，避免现在把原型布局一起丢了

```
nav = 报价 | 派单管理 | 生产与质检 | 供应商 | 账号管理（+3 子项）
```
