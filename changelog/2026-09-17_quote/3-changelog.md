# 变更记录 —— 第 3 步：人工报价

> 2026-09-17 ｜ 新增 3 张表 + 订单状态加 2 个值 ｜ 新域 `domain/quote`

## 改了什么

- **迁移** `2026-09-17_02_quote.sql`
  - `customer_order.status` 加 `QUOTED` / `CONFIRMED`，加状态索引
  - `customer_markup`（每客户一行，`markup_rate numeric(8,4) > 0`）
  - `quote`（版本号、状态、币种 4 选 1、交期天数、发出时的加成率快照、确认时的汇率 / 总计快照；
    CHECK：已确认必须带齐快照、已拒绝必须带拒绝人和时间；部分唯一索引：每单最多一条 `SENT`、一条 `CONFIRMED`）
  - `quote_line`（行序、图号 / 名称 / 数量快照、原价；确认时写对客单价和小计）
- **订单域 `domain/order`**
  - 对外契约 `OrderQuoting` + `QuotableOrder` / `QuotableLine`（报价域只通过它读单、锁单、改状态）；实现 `OrderQuotingService`
  - 运营看单 `OpsCustomerOrderController`：`GET /ops/customer-orders?status=`、`GET /ops/customer-orders/{id}`、
    `GET /ops/customer-orders/{id}/lines/{lineId}/files/{fileId}/view-url`（和客户端同样的校验，落审计，访问方记 OPERATOR）。
    **草稿对运营不可见**（只列 `submitted_at` 非空的单）
  - 仓库：跨客户的列表 / 锁单查询、不动 `submitted_at` 的条件状态迁移
- **报价域 `domain/quote`**
  - `PriceCalculator`：原价 × 加成率 × (EUR→对客币种) ÷ (EUR→CNY)，只在对客单价处取整一次（HALF_UP，2 位）
  - `QuoteService` + `OpsQuoteController` / `CustomerQuoteController`：
    - 运营：`GET/PUT /ops/customers/{orgId}/markup`、`POST /ops/customer-orders/{id}/quotes`（发出 / 重报）、
      `POST .../quotes/preview`（试算，不落库）、`GET .../quotes`（全部版本）
    - 客户：`GET /customer/quotes`、`GET /customer/orders/{id}/quote`、`POST .../quote/confirm {quoteId, rateDate}`、
      `POST .../quote/reject {quoteId}`
  - 错误码：`order.not_quotable`、`order.not_quoted`、`quote.not_found`、`quote.not_open`、`quote.price_changed`、
    `quote.fx_unavailable`（503）、`quote.markup_missing`、`quote.lines_mismatch`、`organization.not_found`
- **前端**
  - 客户端：「我的报价」列表、报价详情（确认 / 拒绝，写明确认前随汇率变动和汇率日期）；订单详情、概览加报价入口；订单状态加「待确认报价 / 已确认报价」
  - 运营端：「报价」页（待报价 / 待客户确认 / 已确认三栏）、报价工作台（看单、看图、设加成率、逐行填原价、选币种、填交期、试算、发出 / 重发、报价记录）。
    **这两页原来的原型假数据（AI 模拟估价、利润率 / 议价空间公式、毛利率）已删掉**；运营端其余页面仍是原型
- 文档：13（§2.1 / §2.3 / §2.06 / 新增 §2.07 / §3.2 / §3.5）、12 §2、11 §4、迁移 README

## 验证（实跑）

| 项 | 结果 |
|---|---|
| 迁移 psql 预演（事务内跑两遍再回滚） | 两遍都不报错；每单第二条 `SENT` 撞部分唯一索引、`CONFIRMED` 缺快照、币种 JPY、`REJECTED` 缺拒绝人、加成率 0、原价 0 共 6 条全部被拒 |
| 迁移从零建库（临时 postgres:16 容器，按序跑全部迁移） | 全部成功，21 张表；结构和 `database/schema.sql` 一致（只差运行器自建的 `schema_migrations`） |
| 本地起后端（已有数据的库） | 开机应用 `2026-09-17_02_quote.sql`，`ddl-auto: validate` 通过，health UP |
| `PriceCalculatorTest` | 先编译失败（RED）→ 8/8：EUR / CNY / USD、四舍五入、汇率不提前取整、小计和总计 |
| `QuoteFlowIT`（真 PG + 真 Redis） | 先 18 条全失败（RED，接口不存在）→ 18/18。含：客户看不到原价 / 加成率 / 汇率数字；三种外币；确认前随汇率变；加成率发出时快照；确认后改加成率、来新汇率价格不变；汇率日期对不上 409；没有汇率 503；重报留版、旧版不能确认；拒绝回待报价可再报；缺加成率 409；行不全 / 多一行 / 重复 / 别单的行 400；非法币种、交期 0、原价 0 / 负数 / 3 位小数、空行、缺交期、加成率 0 / 负数 / 5 位小数 400；草稿对运营 404；运营看图落审计（OPERATOR + 订单上下文），文件不属于这一行 404 且不落审计；别家客户 404；客户调运营接口 403、运营调客户接口 403；确认 vs 重报、确认 vs 拒绝各并发 30 轮，每轮恰好一个成功 |
| 反向验证：去掉确认 / 拒绝里的订单锁 | 「确认 vs 重报」第 0 轮就失败 → 锁是必要的，已还原 |
| 全量 `mvn verify` | 单测 76/76；集成测试 88 条 0 失败 0 报错，5 条跳过（AI / 真网络汇率 / S3，需外部凭据或外网） |
| 前端 `npm run build`（含 `tsc -b`） | 通过 |
| 浏览器实走（本地，dev server） | 运营登录 → 报价列表 → 工作台设加成率 1.2、填 100 / 1000、EUR、25 天 → 试算 € 15.51 / 155.08，合计 € 1,132.09（ECB 09-16 的 7.7380，与测试一致）→ 发出；客户概览提示 1 单待确认 → 报价详情价格一致 → 拒绝 → 显示「暂无报价」；运营重报 USD → 客户看到 $ 16.10 / 170.06（手算核对一致）→ 在库里插一批新日期汇率后点确认 → 提示「汇率刚刚更新」并刷新成新价 → 再确认 → 已锁定；删掉那批假汇率后价格不变 |

本地验证用的账号和数据都只在本机开发库：手工插了一个运营账号 `local-ops@example.com`（仓库里没有建运营账号的入口）和一个测试客户；假汇率已删。

## 没验到的 / 已知问题

- **线上还没有能登录的运营账号**：代码里没有建运营账号的入口，线上验证前需要一个（见部署清单）
- 本地存储是内存实现，浏览器里「运营看图」只验到签发接口，没验到真文件下载（集成测试验了校验和审计）
- ~~两个运营同时第一次给同一客户设加成率报 500~~、~~没有汇率时客户报价列表整页 503~~ —— 09-18 已修，见下
- `application.yml` 里 `app.quote.default-validity-days: 15` 和 `approval.block-negative-margin: true` 没有任何代码读，已和本轮决策不一致（不设有效期、护栏只提醒），本轮没动

## 2026-09-18 线上验证 + 测试后修复

线上走通（运营端在浏览器里点，客户端走接口）：看图（真桶下载比对 PDF）→ 加成率 1.2、原价 100 / 1000、EUR →
试算 € 15.58 / 155.83，合计 € 1,137.55（ECB 09-17 的 7.7009，手算一致）→ 发出 → 客户看价（无原价 / 加成率 / 汇率数字）→
拒绝 → 重报 USD 90 / 950.5 → $ 1,238.65（EUR→USD 1.1481，手算一致）→ 过期汇率日期确认 409 → 确认 → 锁定、再确认 409。

测试后修的（都不需要业务决策）：

| 问题 | 修法 | 测试 |
|---|---|---|
| 两个运营同时第一次设加成率，后到的撞唯一索引 500 | 改成一条 `INSERT … ON CONFLICT DO UPDATE`，后写的生效 | 新增并发用例，修前第 0 轮 500，修后 15 轮全 200 且只有一行 |
| 没有汇率时客户报价列表整页 503 | 列表照常返回，待确认的那几条不带价格；前端写「暂时取不到汇率」。详情页仍 503（不能确认算不出的价） | 原用例补列表断言 |
| 客户拒绝后报价页显示「暂无报价」 | 当前报价包括刚拒绝的那一版（无价格），页面写明在等重报；报价列表仍只列待确认 / 已确认 | 原用例改断言 |
| 运营「待报价」里被拒退回的单和新单看不出区别 | 新增 `GET /ops/quote-summaries?orderIds=`（每单最新一版的版本号和状态，最多 200 个），列表加「报价」列 | 新增用例（只含报过价的单、非法 id 400、超 200 个 400、客户 403） |

全量 `mvn verify`：单测 76/76，集成测试 90 条 0 失败，5 条跳过（外部凭据）。前端 `npm run build` 通过。

仍待需求方定：要不要通知（报价发出 / 客户确认或拒绝）；运营端其余原型页（工作台数字、派单、订单、交易方、定价参数）是隐藏还是等后续步骤再换。

## 部署清单

- [ ] 点 Action。迁移开机自动执行（只加表和枚举值，旧版本 jar 不受影响）
- [ ] 无新 secret、无新环境变量
- [ ] 验：线上 commit 对得上 + health UP（`ddl-auto: validate` 会校验新表）
- [ ] 线上验证需要一个运营账号 —— 需要你决定怎么建
