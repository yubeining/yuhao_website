# 变更记录 —— 第 2 步：客户订单 + 接客户端界面 + 第 1 步返修

> 2026-09-14 ｜ 一个迁移（只加列 / 枚举加值，无新表） ｜ 前后端都有改动

## 改了什么

**迁移** `2026-09-14_01_customer-order-draft.sql`

| 表 | 加了什么 |
|---|---|
| `customer_order` | `status`（DRAFT / SUBMITTED / CANCELLED）、`title`、`wanted_lead_days`（>0）、`submitted_at` |
| `customer_order_part` | `customer_org_id`、`part_revision_id`（锁定的图纸版本）、`part_name`（快照）、`material`、`surface_treatment` |
| `part_revision` | `locked_at` |
| `part_file` | 状态加 `REMOVED` |
| `part_file_access_log` | `context_type` / `context_id`（两者同空或同有值，CHECK 兜底） |

**后端接口**（全在 `/customer/**`）：订单增查改 / 提交 / 取消；零件行增改删 / 换图纸；带订单上下文看图；按图号查零件；删文件。

**第 1 步返修**：A1～A11 全部做完（清单见 `2-implementation-plan.md`）。要点：
- complete 改成**无事务 + 条件 SQL**：存储网络 IO 不再占数据库连接；并发 / 重试不会 500，已完成的直接返回
- 读文件头改用 **HTTP Range 只读 8KB**，不再把整个文件下载一遍
- 版本锁定检查写进状态更新的**同一条 SQL**，「锁定前申请、锁定后 complete」钻不过去
- 下载链接带原文件名（`DownloadFilename` 清洗：去控制字符、引号反斜杠换下划线、超长截断保扩展名、RFC 5987 编码）
- 全局乐观锁异常 → 409 `common.conflict`

**前端**：service 层（浏览器直传 `putToSignedUrl`，XHR 带进度、不带登录头）；订单列表 / 订单详情 / 零件表单 / 首页 / 报价页 / 客户端外壳全部换真数据；错误码翻译表；运营端、供应商端未动。

## 做的过程中发现的问题（都已处理）

| 问题 | 处理 |
|---|---|
| 真实登录后客户端「新建订单」直接报错（读假数据里的当前公司，真实登录不写它） | 客户端页面不再读假数据 |
| 注册接口按 IP 每小时限流 20 次，HTTP 集成测试全从 localhost 注册 —— 本轮加完用例后，一次全量 `mvn verify` 会注册四十多次，从第 21 次起全部 429，失败点在注册 helper 上，看起来像业务代码坏了 | 两个 HTTP 集成测试每个用例前清测试 Redis（同 `AbstractIntegrationTest`）；**没有**为了测试去调高生产限流 |
| 接口配了 `default-property-inclusion: non_null`，值为 null 的字段直接不出现；前端写的 `x !== null` 会把 `undefined` 当成有值 | 前端可能为空的字段一律标可选、判空用 `== null`；测试断言改成「字段不出现」 |

## 验证（实跑）

| 项 | 结果 |
|---|---|
| 迁移本地应用 | 起后端自动应用，`ddl-auto: validate` 通过 |
| psql 塞坏数据 | 非法状态、期望交期 0、状态为空、订单行版本为空、审计上下文只填一半 —— 5 条全部被拒；0 残留 |
| 先失败（RED） | `PartDrawingFlowIT` 新加的 7 条先失败；存储层测试、订单测试先编译失败 |
| 存储层单测 | `MemoryStorageServiceTest` 7、`DownloadFilenameTest` 5、`S3PresignedGetTest` 1，全过 |
| `PartDrawingFlowIT` | 16/16 |
| `CustomerOrderFlowIT` | 13/13（含并发提交只成功一次、带上下文看图记审计、对不上的上下文 404 且不落审计） |
| `ArchitectureTest` | 11/11 |
| 全量 `mvn verify` | 单测 57/57；集成测试 54 条 0 失败 0 报错，4 条跳过（需外部凭据的 AI / S3），exit 0。日志里唯一一次 429 来自 `LoginRateLimitKeyIT`（它本来就是测限流的） |
| 前端 | `npm run type-check`、`npm run build` exit 0 |
| 本地浏览器（dev server + 本地后端，本地库） | 真实账号登录 → 首页问候语来自登录态、外壳公司名来自后端 → 新建订单 → 加零件（图号 / 名称 / 数量 100 / 材料 / 表面处理）→ 进入该行编辑页显示「第 1 版 · 还没有图纸」→ 订单详情显示「1 个零件还没传图纸」、提交按钮 `disabled=true`。控制台无错误；后端日志只有一条已知的 macOS netty DNS 提示，和一次预期内的 404 `part.not_found`（按图号查已有零件，新图号查不到） |

## 没验到的

- **真实文件上传**：本地是内存存储，签出来的上传链接是假的；浏览器面板也没法往文件框里放文件。上传链路由集成测试覆盖（用存储接口直接写字节模拟直传），**真实桶上的浏览器上传要部署后在线上验**。
- **S3 范围读对着真桶**：`S3StorageServiceIT` 需要凭据，本轮没有给它加范围读用例，也没跑。范围读的 S3 实现只经过编译和代码审阅。

## 部署清单

- [ ] 点 Action。迁移开机自动执行
- [ ] 无新环境变量、无 secret、无桶配置变更
- [ ] 验：线上 commit 对得上 + health UP
- [ ] 线上浏览器端到端：建订单 → 加零件 → **真实传图纸** → 下载 → 提交。会在线上留下测试客户和测试文件，做之前先确认

## 遗留 / 已知限制

| 项 | 说明 |
|---|---|
| 提交和删图纸的并发窗口 | 提交检查完图纸、锁定生效之前，同一客户在另一个请求里删掉最后一份图纸，两边都成功，订单会带着没图纸的行被提交。要毫秒级并发两个相反操作才会出现，未修 |
| `part_no` 占位 | 编号规则未定，填的是随机 uuid，界面不显示 |
| 撤回（SUBMITTED → DRAFT） | 文档 12 里只是【建议】，没做 |
| 运营端 / 供应商端 | 仍是假数据，看不到真订单（第 3 步） |
| 客户端首页 / 报价页 | 报价没接，显示「暂无」 |
| PENDING 清理 | 申请了上传没 complete 的行和桶里对象，没有清理任务 |
| 图纸类型白名单 | `.par` / `.prt` / 图片仍待定，文档 9 实样传不上来 |
| 图号匹配 | 精确匹配，只去首尾空格；`lb-001` 和 `LB-001` 是两个零件 |
