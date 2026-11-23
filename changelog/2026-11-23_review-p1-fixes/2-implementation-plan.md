# 全项目 review 的 P1 修复 —— 方案

本人 2026-11-23 批准（「Approve all three」）。三批互不依赖。

## A. 认证状态（后端 auth）

- `RedisService` 加三个不吞异常的方法：`deleteStrict`、`getAndDelete`（GETDEL）、`decrement`。缓存读写仍走原来吞异常的那套。
- `OtpCodeStore.clear` / `PasswordCodeStore.clear`、`RefreshTokenService.revoke / revokeAll / consume` 改用它们。
- refresh token 消费改成 GETDEL 一步完成。
- 验证码改成先计数（INCR）再比对；改密码码比对成功后退回这次计数，新密码不合规时重交不耗次数。

## B. 业务域（后端 order）

- 锁之前只用投影查询取 `opsOrderId`，不把供应商订单实体读进持久化上下文；锁之后再读实体。
  涉及 `SupplierOfferService.sign / withdraw`、`ProductionService.lockSigned / lockForOps`、
  `DispatchService.requireSupplierOrder`（建合同 / 作废合同）、`SignTimeoutJob.cancelOne`。
- `PagedResponse.slice` 加一个「先切页、再为这一页拼视图」的重载；用在视图要逐条查库的两个列表。

## C. 前端（portal）

- `mock/format.ts`、`mock/drawing.ts` 移到 `lib/`；主题拆成独立 provider（localStorage key 不变）；
  `useMock().t` 换成 `useI18n()`；删 `mock/`、未路由的 `BillPage` / `ProfilePage`。
- 删死代码；合并重复的忙碌包装 / 倒计时 / 自动消失计时器 / `day()`。

## 被否决 / 缩小的

- **B 的列表原计划改 6 个接口，实际只改 2 个。**动手前逐个核对：`DispatchService.pool / list`、`SupplierOfferService.offers`
  的视图是批量查的（查库次数固定，不随单数增长），没有 N+1；`SupplierPricingService.orderPrices` 根本不分页、只有一条查询，
  改成分页要改接口契约和前端。真正逐条查库的只有 `ProductionService.list`、`SupplierOfferService.orders`。
- **锁后读最新：没用 `entityManager.refresh`。**项目里服务层只用仓库、不直接拿 EntityManager；投影查询能达到同样效果。
- **并发测试先用两条线程 + 真行锁写，没写成**：持锁那条连接在库里看不到、退单请求从没被阻塞，三次没查出原因，
  按规矩停下换方案 —— 用 `@MockitoSpyBean` 在拿锁前同一线程插一个独立事务把单签掉，结果确定。
