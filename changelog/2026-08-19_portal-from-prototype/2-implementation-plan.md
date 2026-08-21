# 实施计划

## 分层

```
docs/design/prototype/原型v2.html     设计真源，从桌面移入

portal/src/
├── styles.css        原型 590 行 CSS 全量移植，一行不改
├── mock/             内存数据仓（临时层，接后端时整个删掉）
│   ├── types.ts      领域类型，字段名按 camelCase 和后端约定对齐
│   ├── params.ts     平台参数 + 定价算法
│   ├── format.ts     展示层格式化
│   ├── store.ts      状态容器 + sessionStorage 持久化 + 种子数据
│   ├── actions.ts    业务动作（原型的 A.*）
│   ├── selectors.ts  派生查询（只读，和 actions 分开）
│   └── MockProvider  React 接线，唯一写入口 act()
├── i18n/strings.ts   中英文案
├── components/       外壳 + 设计系统组件 + 表单控件 + 品牌图形
└── pages/<受众>/     一级目录 = 受众（CLAUDE.md §2）
```

## 关键决策

### 为什么保留 `mock/` 这一层而不是直接写死数据

用户明确选了「保持可点」。更重要的是：状态流转的规则（抢完所有包才成单、
一行退回不拖死整单、背靠背应付日）是这个原型**唯一值得看的东西**，
写死数据就全没了。

把它单独成层而不是散在页面里，是为了接后端时能整个删掉，页面不用动。

### 为什么把单页状态机拆成真实路由

原型的 `R = {screen, tab, area, sel}` 移过来最快，但：

- 违反 CLAUDE.md §2「页面目录一级 = 受众，和 URL 前缀、后端包结构三者对齐」
- 刷新回登录页，演示时手滑一次就得重新点一遍
- 发不了链接，「你看这个订单」只能口头描述路径

代价是要给每个界面设计 URL，并且数据仓必须持久化（否则刷新后
`/customer/orders/SO-0001` 找不到数据）。用 sessionStorage 解决。

### 为什么用 sessionStorage 而不是 localStorage

演示数据不是用户资产，关标签页就该清掉。而且跨标签页独立，
可以同时开两个窗口演示客户端和供应商端而互不干扰。

### 被否决的方案

| 方案 | 否决理由 |
| --- | --- |
| 直接对接后端接口 | `domain/` 14 个包全空，一个接口都没有 |
| 静态界面 + 写死数据 | 抢单、下单这些流程只能看不能走，原型的价值全在流程上 |
| 照搬单页状态机 | 违反受众-URL 对齐规则；刷新丢页面 |
| 引入状态管理库 | 一个 Context + useState 够用，为演示层加依赖不划算 |
| 把 CSS 拆成 CSS Modules / styled-components | 原型 CSS 是设计真源，拆了就没法和原型逐行对照 |

## 兼容与迁移

- `auth/session.ts`、`services/` 保持原样不动 —— 那是接真后端的路径
- `PortalGuard` 改读 mock 会话，但判断逻辑不变（「当前身份是不是 required」），
  接后端时换数据源即可
- `PortalProbe.tsx` 保留但不挂路由：它验证的 JWT / 拦截器 / 受众前缀
  是 mock 层覆盖不到的真实链路，接后端时先用它跑一遍
