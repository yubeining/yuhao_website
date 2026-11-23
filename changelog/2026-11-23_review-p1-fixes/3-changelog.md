# 全项目 review 的 P1 修复 —— 变更记录

## A. 认证状态（后端 auth）

| 文件 | 改动 |
|---|---|
| `common/service/RedisService.java` | 新增不吞异常的 `deleteStrict`、`getAndDelete`（GETDEL）、`decrement` |
| `platform/auth/RefreshTokenService.java` | 消费 token 改 GETDEL 一步完成；`revoke` / `revokeAll` 删除失败抛异常 |
| `platform/auth/OtpCodeStore.java`、`PasswordCodeStore.java` | `clear` 改 `deleteStrict`；`attempts` + `recordFailure` 换成先计数的 `countAttempt`；密码码加 `refundAttempt` |
| `platform/auth/OtpService.java`、`PasswordService.java` | 先计数再比对；改密码码比对成功退回这次计数 |
| `platform/auth/JwtService.java` | 删掉没有调用方的 `issueRefreshToken`（refresh token 是不透明串，不是 JWT），连带没用的 `refreshTtlSeconds` |

## B. 业务域（后端 order）

| 文件 | 改动 |
|---|---|
| `domain/order/SupplierOrderRepository.java` | 新增两个只取 `opsOrderId` 的投影查询 |
| `SupplierOfferService.java` | `sign` / `withdraw` 先锁再读（抽出 `lockOpsOrderOf`）；`orders` 先切页再拼视图 |
| `ProductionService.java` | `lockSigned` / `lockForOps` 先锁再读；`list` 先切页再拼视图 |
| `DispatchService.java` | `requireSupplierOrder`（建合同 / 作废合同）先锁再读 |
| `SignTimeoutJob.java` | `cancelOne` 先锁再读 |
| `common/dto/PagedResponse.java` | `slice(all, page, size, buildPage)` 重载 |

## C. 前端（portal）

- 删除 `src/mock/`（9 个文件、约 2000 行）、未挂路由的 `supplier/BillPage.tsx`、`supplier/ProfilePage.tsx`、`components/PortalProbe.tsx`。
- `mock/format.ts`、`mock/drawing.ts` → `lib/`（内容没改，只加了 `fmtIsoDate`）。
- 新 `components/ThemeProvider.tsx`（key 仍是 `mfg.prototype.theme`）；`main.tsx` 用它替换 `MockProvider`。
- 29 个页面 `useMock()` → `useI18n()`；`AccountSettingsPage` 原来同时拿了两份一样的 `t`，合成一份。
- 死代码：`customer/status.ts` 的 `ORD_ST / QT_ST / PART_ST / EXEC_ST / isPublished`（连带 `i18n-exempt` 段）、
  `ops/dispatchStatus.ts` 的 4 个 `@deprecated` 别名。
- 合并重复：
  - `components/useBusy.ts`：7 处 setBusy / try / catch / finally（`ops/ProductionPage`、`supplier/OrdersPage` 的签字 / 退单 / 开工 / 完工 / 发货、
    `ops/DispatchPage`、`ops/QuoteWorkPage`、`ops/ProdPage`、`customer/QuoteDetailPage`、`ops/accounts/shared`）。各页成功后的动作（清错误 / 提示 / 重载）原样保留在各页。
  - `components/useCountdown.ts`：登录 / 注册 / 忘记密码 / 设置页 4 处倒计时。
  - `useAutoClear` 放宽成接受开关值，替换设置页、订单详情、报价设置、成本费率 4 处手写计时器。
  - `lib/format.ts` 的 `fmtIsoDate` 替换设置页和账号管理两处 `day()`。
- `customer/OrderDetailPage.tsx`：加载成功时把「不存在」状态复位。

## 验证

- A：`AuthStateConcurrencyIT` 3 个，改前全部失败（20 个并发刷新同一个 refresh token，**18 个成功**；并发猜码超过 5 次上限），改后通过。
  `RedisServiceTest` 3 个（严格删除 / GETDEL 出错要抛、缓存删除仍吞）。
- B：`ContractFlowIT#aWithdrawWaitingForTheLockSeesTheSignatureMadeMeanwhile` 改前返回 `common.conflict`，改后 `dispatch.contract_signed`。
  `PagedResponseTest` 2 个。order 模块全部集成测试通过。
- `mvn verify`：单元 133、集成 190 全过（5 个跳过），退出码 0。
- `npm run build`（含 `tsc -b`）退出码 0。
- 本地浏览器（dev server，测试客户账号）：客户端订单列表 / 报价列表 / 订单详情 / 加零件 / 设置页，登录 / 注册 / 忘记密码页，
  切换路由时没有新的 console 错误；主题切暗色、切回亮色，`<html data-theme>` 和 localStorage 都跟着变。
- **没在浏览器里看过供应商端和运营端页面**：本地没有这两端的测试账号。它们的改动是 `useI18n` 替换、`useBusy` 合并，类型检查通过。

## 已知代价 / 遗留

- `useAutoClear` 按值变化计时：同一条成功提示连续出现两次时，第二次不会重新计满 2 秒（成本费率页以前会）。
- 空值符号仍有两种：`format.ts` 的 `X = '——'` 和页面里直接写的 `'—'`（约 15 处）。这次只把 `day()` 统一成 `X`，
  设置页「注册时间」、账号管理三张表的日期列空值会从 `—` 变成 `——`。其余没动，统一哪一种需要定。
- `SupplierPricingService.orderPrices`、`DispatchService.pool / list`、`SupplierOfferService.offers` 仍是全量查询后内存分页，
  但查库次数固定（批量查），不是 N+1。按数据库分页要改查询，没做。
- 认证状态里 `RefreshTokenService.issue` 写 token 仍走吞异常的 `set`：写失败时登录看起来成功，但之后刷新会 401。没在这次改。
- `router.tsx`、`AppShell.tsx`、`services/auth.ts` 里还有几句提到 mock 的历史注释，描述的是过去的决定，没删。

## 部署清单

- 无迁移，无新配置项。
