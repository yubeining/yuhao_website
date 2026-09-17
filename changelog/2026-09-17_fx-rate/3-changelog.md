# 变更记录 —— 接入 ECB 汇率

> 2026-09-17 ｜ 新增 1 张表 ｜ 只取数、只存，不参与任何价格计算

## 改了什么

- **迁移** `2026-09-17_01_fx-rate.sql`：表 `fx_rate`（来源 / 公布日期 / 基准币 / 目标币 / 汇率 `numeric(18,8)` / 拉取时刻），
  唯一索引 `(source, rate_date, base_currency, quote_currency)`；CHECK：来源只允许 ECB、汇率 > 0、币种三位大写
- **`platform/fx`**：
  - `EcbDailyRatesParser`：JDK DOM，禁止 DOCTYPE（防 XXE），格式不对整份拒绝（缺日期、多于一天、没有汇率、币种或汇率不合格）
  - `EcbRatesClient`：JDK `HttpClient`，连接 10 秒 / 整次 20 秒超时，响应体上限 1MB，非 200 视为不可用
  - `FxRateStore`：一天的汇率在一个事务里 `INSERT … ON CONFLICT DO NOTHING`（包内可见，别的模块不能写）
  - `FxRateSyncJob`：开机 1 分钟后一次，之后每 3 小时一次；Redis 锁 + fence（CLAUDE.md §8）；失败只记 warn
  - `FxRateService`（只读，不换算）+ `GET /ops/fx-rates/latest`
- **配置** `app.fx`：`enabled`（环境变量 `FX_SYNC_ENABLED`，默认开；测试 profile 关）、`ecb-daily-url`（`FX_ECB_DAILY_URL`）、超时、同步间隔
- 文档 13 §3.1：数据源已定为 ECB，并记下和银行汇率约 1% 的差距；迁移 README 加归属和清单

## 验证（实跑）

| 项 | 结果 |
|---|---|
| 迁移本地应用 + psql | 非法来源、汇率 0、小写币种、四位币种 4 条全部被拒；同一天同币种第二次 `ON CONFLICT DO NOTHING` 插入 0 行，不带它则撞唯一索引；0 残留 |
| `EcbDailyRatesParserTest` | 先编译失败（RED）→ 11/11；解析失败不往 stderr 打 `[Fatal Error]` |
| `FxRateSyncIT`（本地假 ECB，真 PG + 真 Redis） | 先编译失败（RED）→ 11/11：入库、同一天重复拉行数不变、新一天新增一批、别的实例持锁则跳过且不请求上游、同步后放锁、上游 500 / 坏 XML / 超时都不入库不抛且放锁、运营端查到最新一批、没有数据时返回空列表、客户访问 403 |
| `ArchitectureTest` | 11/11 |
| 真网络 `EcbRatesClientLiveIT` | 1/1，本机能从 ECB 拉到并解析出 CNY |
| 本地起后端（已迁移的库，`ddl-auto: validate`） | 启动成功，无 schema 校验错误；开机 72 秒时自动同步：`rateDate=2026-09-16 currencies=29 inserted=29`，库里 EUR→CNY 7.73800000 |
| 全量 `mvn verify` | 单测 68/68；集成测试 70 条 0 失败 0 报错，5 条跳过（AI / 真网络汇率 / S3，需外部凭据或外网）。测试期间定时同步没有自动跑（12 条同步日志全部来自测试主线程，调度线程 0 条） |

## 没验到的

- **线上北京区能不能连上 ECB**：本机能连，线上没测过。这是这次最大的不确定。

## 部署清单

- [ ] 点 Action。迁移开机自动执行
- [ ] 无新 secret；新增的两个环境变量 `FX_SYNC_ENABLED` / `FX_ECB_DAILY_URL` 都有默认值，不配也行
- [ ] 验：线上 commit 对得上 + health UP（`ddl-auto: validate` 会校验新表）
- [ ] 开机约 1 分钟后在 DevBox 上看同步日志是 `fx sync done` 还是 `fx sync failed`

## 遗留

| 项 | 说明 |
|---|---|
| 换算 / 锁定 / buffer / 差额承担 | 都没做，等第 3 步定政策（文档 13 §3.1） |
| 运营端「汇率」页 | 仍是原型假数据 `7.8`，没接这个接口 |
| 过期告警 | 没做（多少天算过期没有依据）；拉取失败只在日志里 |
| 北京区连不上 ECB 时 | 需要另选国内数据源，那是新的决定 |
| `CacheKeys.fxRate` | 空壳 key，没动 |
