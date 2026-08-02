# 4 — WeAct 架构借鉴清单

> WeAct 是同栈的生产系统：3233 个 Java 主代码文件、1286 个测试文件（734 单测 + 545 集成测试）、
> 529 个数据库迁移、1653 个变更记录文件夹。
>
> **它的架构不是设计出来的，是被事故打出来的。**真正值钱的不是目录结构，
> 是那 7 道提交闸门和一堆约定文档 —— 每一条背后都有一次线上事故。
>
> 下面逐项裁决：哪些原样抄、哪些改造抄、哪些千万别抄。

---

## A. 原样借鉴（Day 0 就要有）

### A1 — 域内四层目录
`controller/ service/ repository/ dto/`。单文件域保持扁平。
定时任务 / 外部适配器 / 数据回填一律进 `service/`，**不另开 `scheduler/` `adapter/` 目录**。

**配套硬规则**：不确定新域该放 `platform/` 还是 `domain/` → **停下来问，不许先随便放以后再搬**。
WeAct 有过一次 `pm_*` → `planner_*` 的全量改名，代价是 10 个后续迁移要重写 + 4 天后再补一个清理迁移。

### A2 — 统一 API 外壳
```java
ApiResponse<T> { int code; String message; T data; }
```
`ResponseBodyAdvice` 自动包装（byte[] / Resource / 已是 ApiResponse 的跳过）
+ `GlobalExceptionHandler` 集中翻译异常。

前端**一个** `services/core/http.ts` 收口所有请求，**禁止第二个 HTTP client**。
认证头、401 处理、错误包装全在这一处。WeAct 明确写了"不要重新引入 axios 单例"。

### A3 — 手写迁移 + 开机自动应用
- `ddl-auto: validate`（Hibernate **永远不写 DDL**）
- 迁移文件 `database/migrations/{YYYY-MM-DD}_{NN}_{slug}.sql`，必须幂等（`IF [NOT] EXISTS`）
- 开机时拿 Postgres advisory lock → 按 `(文件名, 内容hash)` 幂等应用 → 多 pod 安全
- **已应用文件的 hash 变了 = 启动报漂移错误**，逼你新开文件而不是偷偷改
- 两位序号 `_01_` 是被字典序坑过之后加的（`-` 0x2D < `.` 0x2E，导致 `_slug-suffix.sql` 排在 `_slug.sql` 前面）

**所有环境跑同一套迁移，没有例外。**WeAct 的测试环境曾用 `ddl-auto: update` 且禁用迁移，
漂移出 69 个坏的 CHECK 约束，最后靠一段脚本批量删。

### A4 — 测试双层制，靠文件名后缀区分
| 后缀 | 层级 | 规则 |
|---|---|---|
| `*Test.java` | 单元测试 | mock 一切协作者 |
| `*IT.java` | 集成测试 | **必须真 PostgreSQL + 真 Redis，禁止 mock 缓存** |

**为什么禁止在 IT 里 mock Redis**：缓存命中路径正是 Jackson / 泛型 / 懒加载 bug 的藏身之处。
mock 掉缓存的 IT 等于 CI 全绿着上线炸 —— WeAct 一次 26 处 `LinkedHashMap` ClassCastException
就是这么漏出去的。

**这个项目的 IT 重点不同**：每个供应商端端点必须有一个负向测试
——「看不到别家供应商 / 看不到客户身份 / 看不到对客价」。这类测试要做成模板。

### A5 — JPA / Hibernate 三个必踩的坑
| 坑 | 正确写法 |
|---|---|
| `LocalDateTime` 字段与 schema 的 `timestamptz` 静默漂移 | `@Column(columnDefinition = "timestamp with time zone")` |
| jsonb 字段绑定失败 | `@JdbcTypeCode(SqlTypes.JSON)` + `columnDefinition = "jsonb"`（写 `"json"` 是坑） |
| 自定义 `@Query` 的 UUID 参数运行时绑定失败 | Repository 泛型必须匹配实体 `@Id` 类型；配 `hibernate.type.preferred_uuid_jdbc_type: VARCHAR` |

### A6 — `@Scheduled` 必须加按条目的 Redis 锁
```
SET lock:scheduler:<job>:<itemId> <uuid> NX EX <ttl>
  未拿到 → 静默跳过（别的 pod 在处理）
  拿到   → try { work } finally { releaseLock(key, uuid) }
```
DB 层必须有唯一索引兜底（防锁 TTL 到期后的重复执行）。

**明确禁止**：假设"我们现在只有一个 pod"；引入 leader election / 分布式锁表这类新基础设施。

这个项目会用到的定时任务：报价过期扫描、供应商报价过期提醒、生产里程碑逾期提醒、
汇率同步、物流跟踪轮询。**每一个都要加锁。**

### A7 — 文件直传对象存储
后端绝不碰字节。详见文档 2 §5.1 的五条信任边界。

### A8 — 变更记录三件套
```
changelog/{YYYY-MM-DD}_{slug}/
  1-requirement.md         需求 / 用户原话 / 背景 / 验收标准
  2-implementation-plan.md 动手前对齐的计划（含被否决的方案和原因）
  3-changelog.md           真实发生的改动 + 部署清单 + 遗留项
```
**一分支一文件夹**（不是一 commit 一个）。同一功能的多个阶段共用一个文件夹。

**豁免**：一行修复、错别字、依赖升级、纯机械重构。
判据是"**光看 diff 会不会对'为什么'留下疑问**"—— 不会就不用写。

### A9 — 提交前闸门（先上 4 道，全部 diff-aware）
| # | 闸门 | 防什么 |
|---|---|---|
| 1 | commit message 格式 | 提交历史可读、可追溯到工单 |
| 2 | 密钥扫描（任何文件） | 密钥进 git 历史 = 强制去供应商侧轮换 |
| 3 | 遗留冲突标记 `<<<<<<<` | 编译型文件 javac/tsc 会抓，但 `.sql` `.md` 没人解析，能活到 psql 失败 |
| 4 | 迁移文件名（不许未来日期 + 序号全局唯一） | 迁移执行顺序错乱 |

**diff-aware 是精髓** —— 只卡新增/修改的行，存量欠债自动豁免。
这让你可以在项目中途引入新闸门而不用先还完债。

**新增闸门要三处同步**：`scripts/check-*.py` + `.githooks/pre-commit` + CI workflow。

### A10 — PR 模板五轴 + 坏味道目录
PR 模板把「标准 / 完整性 / 烂代码 / 重构 / 安全」拆成**可勾选的具体项**，
每项要么 ✓ 要么 ✗ 要么 N/A（写一行理由），不允许整轴一键勾。

配一个 `docs/conventions/code-smells.md` 的**具名坏味道目录**，
review 时按名字引用（"这是 #2 switch-on-string"）。

**豁免必须写进文档** —— 没记录的豁免和忘记的违规无法区分。

> ⚠️ 但**不要一开始就抄 WeAct 的 8 条坏味道** —— 它们对应的是 WeAct 的事故，不是你的。
> 起个空壳，边踩边填。

---

## B. 改造后借鉴

| 项 | WeAct 的做法 | 这个项目怎么改 | 为什么 |
|---|---|---|---|
| **分包** | `platform/` + `module/` + `appcenter/` 三分 | **`platform/` + `domain/` 两分** | 你是单一业务流的垂直系统，没有 app center 形态 |
| **租户模型** | `organizationId` 贯穿全表，租户间数据行完全不相交 | `partyId` + **投影分离**（文档 2 §3.2） | 三端看的是同一对象的不同投影，不对称，不能照抄 |
| **权限引擎** | jCasbin + 逐人授权 + 敏感资源拒绝 | **端级路径前缀硬闸门** + ops 端内简单 RBAC，先不上 Casbin | 跨端泄露是头号风险，粗闸门更安全；个位数供应商不需要复杂授权 |
| **缓存策略** | 强制"每个 service 读方法都要 Redis 缓存" | **有实测热点才加缓存** | 全量缓存是重大复杂度来源，收益不匹配 |
| **审计** | 全套 AuditService + 前后端双向注册的 target_type 目录 | 保留骨架，**Day 1 只审计三类**：图纸访问、报价变更、订单状态流转 | 图纸访问审计是这个项目的合规交付物，优先级最高 |
| **通知** | 邮件 + Teams | 客户走邮件；**供应商必须走微信/企微**；内部走企微 | 中国供应商邮件响应率极低，只发邮件等于没发 |
| **认证** | Azure AD 单一路径 | 三端三套（邮箱密码 / 手机验证码 / 企微扫码），但汇入同一个 `provisionAndIssueToken` 出口 | 三种受众的现实条件完全不同；但出口不统一会永久性地不一致 |
| **DDD 分层** | 明确禁用（CRUD 为主） | **同样禁用** | 真正有领域逻辑的只有定价引擎一个模块，为它套全局 DDD 是过度设计 |

### B1 — 缓存写路径的铁律（这条要保留）

即使缓存用得少，只要用了，就必须遵守：

> 任何 `@Transactional` 方法里调用 `repository.save(entity)` / `delete(entity)` 的，
> **实体必须通过 `loadManaged(partyId, id)` 直连 repository 加载**，不能复用带缓存的 `findById`。

**原因**：缓存命中返回的是 Jackson 反序列化的实体，`@ManyToOne(LAZY)` 关联是 `null`。
`save()` 走 `merge` 会把关联外键写成 `NULL` → NOT NULL 约束炸。
而且**只在实体被读过一次进了缓存之后才复现**，mock 测试永远抓不到。

> 但更好的解法见 C2：**从一开始就不缓存 JPA 实体，只缓存 DTO。**

---

## C. 千万别抄 ★ WeAct 踩出来的坑

### C1 — 前后端 camelCase ↔ snake_case 自动转换层

WeAct 在 `core/http.ts` 里做了自动大小写转换，为此攒了**两组豁免名单**，每一条都是一次线上 bug：

- 自动化流程图的 `actionType` 被转成 `action_type` → 每次保存画布 400
- 表单配置的 `ui.minSelect` 被转成 `min_select` → 字段校验静默失效
- snake_case 镜像 key 回写覆盖用户编辑 → 编辑静默丢失
- 用户自定义字段名被转换 → 自定义字段全部保存失败

**这个项目的做法：前后端统一 camelCase 到底，不做任何转换。**
Jackson 默认就是 camelCase，什么都不用配。数据库列名用 snake_case（PG 惯例），
JPA 的 `@Column` 负责映射，仅此一处。

> 这是我在 WeAct 整个代码库里看到的**最大一笔无谓技术债**。

### C2 — 缓存 JPA 实体
只缓存 DTO。缓存实体是原罪，见 B1。

### C3 — 表改名不配套删旧表
WeAct 的 `pm_*` → `planner_*` 改名没同步删旧表，
后续 10 个迁移手滑写了 `CREATE TABLE IF NOT EXISTS pm_xxx`，把空的旧表又建回来，
每个长期环境都留下垃圾表，4 天后才补上清理迁移。

**规则**：改名迁移必须**同 PR、同日**配一个 `DROP TABLE IF EXISTS ... CASCADE`。

### C4 — 中文硬编码进 Java
WeAct 有一道专门的闸门禁止在 Java 里新增非 ASCII 字符串字面量
（历史欠债 133 条 / 30 个文件，grandfather 掉了）。

**这个项目更严格**：三语系统（EN/DE 给客户、中文给供应商和内部）。
**后端只返 code，不返文案，翻译全在前端。**
错误消息、状态名、邮件模板、通知内容，全部 code 化。

### C5 — API 前缀硬编码进路径匹配
全局前缀（`/api/v1`）放 **MVC 层**（不是 Tomcat context-path），
且所有做路径匹配的地方（Security matcher、拦截器、WebSocket 注册）**必须从配置推导**，
代码里不许出现 `/api/v1` 字面量。

### C6 — `String.equals(UUID)`
`UserPrincipal.getId()` 是 String（JWT sub），实体 ID 是 UUID。
`.equals()` 跨类型恒为 false，且**没有编译警告**。

WeAct 因此出过两次水平越权 bug，最后专门加了一道闸门。
统一写法：`principal.getId().equals(entity.getOwner().getId().toString())`。

**这个项目建议更彻底**：`UserPrincipal.getId()` 直接存 `UUID` 类型，从源头消灭这类比较。

### C7 — 历史单据 join live 配置
WeAct 出过：审批表单改模板后历史实例被篡改、OKR 修订行 overlay 导致数字对不上、
定时提醒重复发送。根因都是同一个 —— **历史单据不是自包含的**。

**这个项目最关键的应用**：报价行必须快照全量定价分解（文档 3 §2.2）。
报价一旦发出，其内容与任何 live 配置解耦。

---

## D. 借鉴优先级速查

| 优先级 | 项 | 何时做 |
|---|---|---|
| P0 | A1 分包 / A2 API 外壳 / A3 迁移体系 / C1 不做大小写转换 | 第一行代码之前 |
| P0 | 文档 2 §3 的身份隔离 + 六条铁律 | 第一个业务端点之前 |
| P0 | A4 测试双层制 + 供应商端负向测试模板 | 第一个测试之前 |
| P1 | A9 四道提交闸门 / A8 变更记录 / A10 PR 模板 | 第一次多人协作之前 |
| P1 | A5 JPA 三坑 / A6 定时任务加锁 / C6 UUID 类型 | 写到相应代码时 |
| P1 | 文档 3 §4 报价五道护栏 | 报价功能上线之前（**不可延后**） |
| P2 | A7 直传 / C4 文案 code 化 / 审计 | Phase 1 内 |
| P3 | 缓存 / 供应商评分算法 / 坏味道目录填充 | 有实际需要时 |
