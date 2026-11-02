# 实施计划 —— 逐页处理 mock，能改的改、该删的删（2026-11-02）

## 逐页判断依据

统一问三个问题，答不上来就不动：

1. 这页要的数据，后端**有没有**？（有 → 接；没有 → 看第 2 条）
2. 没有的原因是「还没做」还是「不该做」？
3. 如果要做，字段/状态**是谁定的**？（定不了 → 停下来问，不自己补）

## 处理结果

| 页面 | 结论 | 依据 |
|---|---|---|
| `components/AppShell` | 接后端 | 客户端壳早就读 `/customer/organization`；供应商壳还在读 mock，而后端 `/supplier/organization` 已存在（同一个 handler），补一个 service 即可 |
| `pages/ops/DashboardPage` | 接后端（只上 3 个指标） | 5 个指标里 3 个直接对应状态枚举；另外 2 个（「产能没锁满」「已提交材料」）后端没有对应字段或状态 |
| `pages/auth/SupplierRegisterPage` | 删除 | 供应商是邀请制，真实流程是 `/auth/invite?token=...`；这张 14 字段的三步长表单后端一个都存不下，且全仓库无任何链接指向它 |
| `pages/auth/VerifyPage` | 删除 | 无任何链接指向；邮箱取自 `session.pendingMail`，而写它的 `signup()` 已无人调用；后端无验证端点 |
| `pages/ops/RatesPage` | 删除 | 页面公式 `基准成本 × (1+利润率) ÷ 汇率` 与已拍板的 `原价 × 加成率 × 汇率比` 冲突，且前者在文档 13 里被明确删除；两个真实旋钮已有归属（客户加成率 → 报价工作台，供应商折率 → 交易方页），汇率由 ECB 自动同步只读 |
| `pages/supplier/ProfilePage` | 不动 | 8 组字段只有 1 个在后端；其余涉及财务主数据归属，需需求方先定 |
| `pages/ops/OrdersPage` | 不动 | 前端 10 个状态词表 vs 后端 6 个，且后端明确停在 `READY`（发货/回款那一轮没做） |
| `pages/supplier/BillPage` | 不动 | 需求已确认（文档 11 D15），但 Q16 三个问题未答 |
| `pages/SettingsPage` | 不动 | 登出已走真接口，只剩 `act(logout)` 一行死代码 + 主题状态，不属于后端问题 |

## 被否决的方案

- **先拆 `MockProvider`**（拆成 session / i18n / theme / data 四个 Provider）。
  技术上是对的，但它不产生任何用户可见变化，且当作「顺手做」会掩盖真正的问题。
  等真要整体删 mock 时再单独做。
- **把 `RatesPage` 改造成「客户加成率 + 供应商折率」页**。否决原因：这两个旋钮
  已经分别有归属，再造一个页面等于同一件事两个入口，且「定价参数该不该集中放在一页」
  是产品决定，不是清理工作该顺带定的。
- **给 `ProfilePage` / `OrdersPage` 补后端**。否决原因：字段归属和状态机都没有依据，
  按 CLAUDE.md §10 C5 不能先建再报备。

## 风险

删除的三个页面都是孤儿路由（无任何链接指向），删除不影响任何可达流程。
`SupplierDonePage` 只被 `SupplierRegisterPage` 引用，两者一起删。
