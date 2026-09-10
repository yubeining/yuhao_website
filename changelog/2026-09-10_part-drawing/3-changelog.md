# 变更记录 —— 第 1 步：零件图纸 + 访问审计

> 2026-09-10 ｜ 新增 3 张表 ｜ 只做后端 + 集成测试，不接界面

## 改了什么

**迁移** `2026-09-10_02_part-revision-and-file.sql`（全归 `domain/order`，无外键）

| 表 | 用途 |
|---|---|
| `part_revision` | 图纸版本，挂 `part_design`。`rev_no` 我方编，唯一 `(part_design_id, rev_no)` |
| `part_file` | 版本下的文件。两段式上传：`PENDING → COMPLETED \| REJECTED` |
| `part_file_access_log` | 每签发一次查看 URL 一行。bigserial、只增（`@Immutable`） |

`customer_org_id` 冗余到三张表，租户条件直接进查询（§3 铁律 2）。存储 key 服务端生成 `drawing/<uuid>`，不含客户文件名。

**接口**（全在 `/customer/**`）

| 方法 | 路径 |
|---|---|
| POST | `/customer/parts` —— 同客户同图号 409 `part.code_taken` |
| GET | `/customer/parts/{partId}` |
| POST | `/customer/parts/{partId}/revisions` |
| POST | `/customer/parts/{partId}/revisions/{revisionId}/files` —— 扩展名不在白名单 400 |
| POST | `/customer/files/{fileId}/complete` —— 内容不符 400 + REJECTED + 删对象 |
| GET | `/customer/files/{fileId}/view-url` —— 未完成 409；别人的文件 404；成功落审计 |

**其他**：`application.yml` 删 `max-drawing-size-mb`（需求方定了不卡大小）；迁移 README 归属表 + 迁移清单（顺带补上之前漏记的 `2026-09-09_01`、`2026-09-10_01`）；文档 11 第 1 步那行和推迟项。

## 两个关键实现点

1. **看图顺序「校验 → 签名 → 写审计 → 返回」**：审计写不进去就抛异常，URL 不离开服务端。校验不过不落审计。
2. **complete 用 `@Transactional(noRollbackFor = BusinessException.class)`**：拒绝靠抛异常回 400，默认会把 REJECTED 回滚、文件永远卡在 PENDING。
   **变异验证过**：删掉它后 `contentThatDoesNotMatchItsExtensionIsRejectedAndDeleted` 失败，`expected: "REJECTED" but was: "PENDING"`。

## 验证（实跑）

| 项 | 结果 |
|---|---|
| 迁移本地应用 + psql 塞坏数据 | 4 条 CHECK + 版本号唯一索引全部拒绝；全库 0 外键；0 残留行 |
| 起后端 `ddl-auto: validate` | 通过，0 个 schema 校验错误 |
| `DrawingTypeGuardTest` | 17/17 |
| `PartDrawingFlowIT` | 9/9（计划 8 条 + 客户 B 不能在客户 A 的零件上建版本） |
| `ArchitectureTest` | 11/11（域里第一次有 Repository，`domainRepositoriesAreNotPublic` 不再空转） |
| 全量 `mvn verify` | 单测 49/49；集成测试 34 条 0 失败 0 报错，4 条跳过（需外部凭据的 AI / S3），exit 0 |

**类型校验实测**（项目 classpath 跑 tika-core 3.0.0，应用解析到 commons-io 2.17.0）：

| 扩展名 | 判据 | 强度 |
|---|---|---|
| PDF / ZIP / DWG / DXF | tika 按文件头 | 真校验（DXF 带 `; format=ascii` 参数，比较前去掉） |
| STEP / STP | ISO 10303-21 首行 `ISO-10303-21;` | 真校验 |
| IGES / IGS | tika 没有文件头规则；按 IGES 规范判首条 80 列记录第 73 列 | **规范推出，未用真实客户文件验证** |
| SLDPRT | tika 只认得出 OLE2 容器 | 只验到容器 |
| X_T | 无可验证签名 | 只能信扩展名 |

## 部署清单

- [ ] 点 Action。迁移开机自动执行，在端口打开前完成
- [ ] 无新环境变量、无 secret 变更、无桶配置变更
- [ ] 验：`/api/v1/public/ping` 的 commit 对得上 + `/actuator/health` UP（迁移失败起不来；`ddl-auto: validate` 会拿新实体校验表结构，两道都过即证明表建好）

## 遗留 / 已知推迟

| 项 | 何时处理 |
|---|---|
| 红线 1「一键导出」 | 推迟（需求方知情，与 CLAUDE.md §3 铁律 6 冲突） |
| 审计不存来源 IP；无业务上下文列 | 推迟；上下文列随第 2 步 |
| 桶 CORS + 真实浏览器直传 | 第 2 步接界面时。本轮 memory 存储的预签名 URL 是假的 |
| 订单行锁版本的锚定列 | 第 2 步建订单行时 |
| 版本锁定（被引用 / 被报价后不可改） | 第 2 / 3 步 |
| 运营看图 | 第 3 步（报价） |
| 类型白名单（`.par` / `.prt` / 图片） | 待定。文档 9 实样目前传不上来 |
| IGES 判据未用真实文件验证；X_T 只信扩展名；SLDPRT 只验容器；ZIP 不解包不防炸弹 | 有真实样本后回头验 |
| 申请了上传但没 complete 的 PENDING 行 | 无清理任务 |
| complete 读文件头是开完整对象流再提前关闭（`StorageService` 没有范围读） | S3 SDK 可能打「未读完」警告，功能无影响 |
| 迁移里的 CHECK 约束 `mvn verify` 覆盖不到（测试用 JPA 建表） | 本次靠本地 psql 实测 |
