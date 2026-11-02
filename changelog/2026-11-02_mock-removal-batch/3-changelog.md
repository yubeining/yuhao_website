# 变更记录 —— 清理 mock 层与过期文档（2026-11-02）

## 验证

本机 JDK 25（工作区内 Temurin 25.0.5），测试库与 Redis 指向 compose 的测试实例：

```
mvn test                          78 项，0 失败
mvn verify                        129 项，0 失败，5 跳过
npm run type-check                通过
npm run build                     通过
```

跳过的 5 项依赖外部服务：`AiServiceIT` 2 项（无 AI key）、`EcbRatesClientLiveIT` 1 项（实时行情）、
`S3StorageServiceIT` 2 项（无真实桶）。跳过不等于通过。

前端构建体积变化（逐个提交累积）：`426.39 kB → 414.27 kB`（gzip `130.77 → 127.33 kB`）。

## 一、新增运营工作台接口

`GET /ops/dashboard` → `{ pendingAssembly, assembling, offered }`，三个计数各对应一个状态枚举：

| 指标 | 口径 |
|---|---|
| 待安排生产 | `customer_order.status = CONFIRMED` |
| 组包中 | `ops_order.status = ASSEMBLING` |
| 在挂生产订单 | `ops_order.status ∈ (OFFERED, PUBLISHED)` |

- 新增 `OpsDashboardController`（`domain/order`，两个仓储同包，不构成跨域查询）
- 两个仓储各加一个 `countByStatus`
- 前端新增 `services/ops/dashboard.ts`，`DashboardPage` 重写

**刻意没做的**：原页面另外两个指标（「已安排生产 · 产能没锁满」「待考察供应商 · 已提交材料」）
后端没有对应的字段或状态。按 CLAUDE.md §10 C5 整块不显示，页面上留一段说明写清原因，
不留占位符 —— 占位符上线之后没人记得它是假的。

**不显示 0 的原因**：接口失败时显示 `——` 而不是 `0`。`0` 会被读成「真的没有待办」。

## 二、供应商壳改成读后端

- 新增 `services/supplier/organization.ts#getMySupplierOrganization`（`/supplier/organization`）
- `SupplierShell` 的公司名改为 `getMySupplierOrganization()`，与 `CustomerShell` 同一套写法
- `AppShell` 删除全部 mock 依赖：`currentUser` / `currentCompany` / `findCompany` / `act(logout)`
  以及「切换身份」下拉

「切换身份」是原型演示功能（一个账号多身份），真实登录下一个账号只属于一个端。
它原本也不会显示：mock 的种子是空的（2026-09-18 删掉演示数据），`currentUser()` 恒为
`undefined`，那段 JSX 从未渲染过。

## 三、删除四个没有后端的页面

| 页面 | 为什么删 |
|---|---|
| `auth/SupplierRegisterPage` | 供应商是邀请制，真实流程是 `InvitePage`；14 个字段后端一个都存不下；无任何链接指向 |
| `auth/SupplierDonePage` | 只被上一条引用，一并删 |
| `auth/VerifyPage` | 无任何链接指向；邮箱来自无人写入的 `pendingMail`；后端无验证端点 |
| `ops/RatesPage` | 公式与已拍板算法冲突；页面上的参数没有一个是真实生效的 |

同步删掉 `router.tsx` 的 5 条路由与 import、`AppShell` 侧栏的「定价参数」菜单项。
`RatesPage` 上真正的两个旋钮没有丢：客户加成率在报价工作台（`QuoteWorkPage`），
供应商折率在交易方页（`PartiesPage`），汇率由 ECB 每日同步、本来只读。

## 四、文档修正

| 文件 | 改了什么 |
|---|---|
| `README.md` | 顶部状态块、「已完成 / 未完成」整段重写；`site/` 描述；`devLogin` 说法；补 `mvn verify` 的测试库指向说明 |
| `README.md` | 删掉 `DEV_SEED_ENABLED` 与三个测试账号表（**该开关在代码里不存在**） |
| `.env.example` | 删掉 `DEV_SEED_ENABLED` |
| `deploy/README.md` | 删掉 `DEV_LOGIN_ENABLED` 那段红线警告（该开关同样不存在） |
| `deploy/devbox/bootstrap.sh` | 删掉会写进 `.env` 的 `DEV_LOGIN_ENABLED=false` |
| `deploy/devbox/apply-env.sh` | 删掉该变量的回显 |

`changelog/` 里的历史记录没有改 —— 那是当时的事实。

## 部署清单

- 无迁移、无配置项变化，正常发版即可
- 新增端点 `GET /ops/dashboard` 走 `/ops/**` 前缀闸门，无需额外授权配置
- 若要验证：运营账号登录后打开「工作台」，三个数字应与库里的状态计数一致

## 遗留项

- **`ProfilePage`**：8 组字段只有 1 个在后端，其余涉及财务主数据归属，待需求方确认
- **`OrdersPage`**：前端 10 个状态 vs 后端 6 个状态；客户订单走到 `READY` 之后的发货与回款没有做
- **`BillPage`**：文档 11 D15 已确认要做，但 Q16 三个问题未答（回款谁录 / 发票核验做到哪一步 / T+N 的 N）
- **`mock/MockProvider` 仍未拆**：30 个文件依赖它，其中多数只是借它取 i18n 文案
- **运营账号没有创建入口**：`ops_user` 表在，但没有任何播种或注册代码
