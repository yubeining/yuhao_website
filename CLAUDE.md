# 机加工跨境定制平台 — 工程规范

> 本文件是团队规范的唯一真源，也是 AI 助手（Claude Code / Cursor）的上下文。
> 每一条规则背后都有理由，理由写在规则旁边 —— 不写理由的规则会被绕过。
>
> 完整设计文档见 [`docs/design/`](./docs/design/)。SQL 迁移注释里提到的
> 「设计文档 N §x.y」指的就是 `docs/design/N-*.md` 的对应章节。

---

## 强制约束（不可绕过）

以下规则任何情况下都不能放松，包括「就这一次」「先上线再说」「本地跑一下」：

- **提交格式校验不可绕过。**每次 `git commit` 前确认 hook 已激活：
  `[ "$(git config --get core.hooksPath)" = ".githooks" ] || git config core.hooksPath .githooks`
  **永远不用 `--no-verify`**。消息被拒就改消息，不改校验器。
- **数据库写操作前先确认。**任何 `DROP` / `TRUNCATE` / 无 `WHERE` 的 `UPDATE` / `DELETE`，
  必须先把完整 SQL 贴出来给人看，得到明确同意再执行。
- **生产环境操作前先确认。**部署、改配置、改 secret、重启，每一条命令单独确认，不批量。
- **合并前必须过五轴审查。**见 `.github/PULL_REQUEST_TEMPLATE.md`。
  **CI 绿是机械底线，不是批准** —— 它只证明代码能跑，不证明授权正确、不证明功能完整。

---

## 1. 业务背景（一分钟版）

欧洲客户上传图纸 → 我们后台评审 → 匿名化下发给中国供应商 → 收集报价 → 综合定价 →
对客报价 → **客户点接受即正式订单** → 拆生产订单（同一零件可拆多家）→ 供应商生产 →
我们质检 → 包装 → 第三方物流送到欧洲。账款线下走，平台只记状态。

**三个端**：客户端（欧洲）/ 供应商端（中国）/ 内部后台。加一个独立官网。

---

## 2. 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Java 21 / Spring Boot 3.5 / Spring Data JPA / Spring Security + JWT |
| 数据库 | PostgreSQL（`ddl-auto: validate`，schema 由手写迁移管理） |
| 缓存 | Redis |
| 前端 | Vite 6 / React 19 / TypeScript / React Router 7（**SPA，不是 SSR**） |
| 官网 | SSG，独立部署（尚未开始） |
| 构建 | Maven（`mvn test` 只跑单测；`mvn verify` 才跑 `*IT.java`） |

### ★ 前端是 SPA，和后端同一个部署单元

`portal` 的 `vite build` 产物直接输出到 `backend/src/main/resources/static/`，
由 Spring Boot 一并托管 —— 一个 jar、一个容器、一个端口。

**原方案是 Next.js（SSR + middleware + next-auth），已放弃。** 原因：

- Next.js 必须跑独立的 Node 进程，「前后端一起部署」就变成两个容器 + 一个网关分流规则，
  外加一套跨域配置。而本系统的前端<b>没有一个页面需要 SSR</b> ——
  三个端全部要登录才能看，SEO 无从谈起，首屏速度也不是这类内部系统的瓶颈。
- 需要 SEO 的只有官网，而官网本来就是独立的 `site/`（SSG + 独立域名）。

由此产生的两条约束：

1. **`middleware.ts` 的端级跳转由 `components/PortalGuard.tsx` 承担**，
   语义完全一致 —— 它仍然只是体验层，不是安全边界。
2. **新增一级路由要同时改两处**：`portal/src/router.tsx` 和后端的
   `SpaForwardController`。漏了后端那处，SPA 内跳转正常，但**直接访问或刷新会 404** ——
   这个 bug 只在刷新时出现，开发时很容易漏掉。

**全局 API 前缀** `/api/v1` 在 **MVC 层**配置（`app.api.prefix` + `ApiPrefixConfig`），
不是 Tomcat context-path。任何做路径匹配的地方（Security matcher、拦截器、WebSocket 注册）
**必须从配置推导，代码里不许出现 `/api/v1` 字面量**。

---

## 3. 三条红线

### 红线 1 — 图纸访问全审计
每一次访问（含每一次生成签名 URL）必须落 `file_access_log`：
谁 / 何时 / 哪个 revision / 哪个文件 / 从哪个 IP / 什么业务上下文。

**这不是"以后加"的功能**，是跟欧洲客户签保密协议时的交付物。
客户会问"如果我的图纸泄露了，你们能查到是谁看过吗"，要能一键导出。

### 红线 2 — 供应商端 response 白名单序列化
供应商端返回的 DTO **只允许显式列出的字段**，默认不暴露。不是"排除敏感字段"，
是反过来 —— 新加字段默认不出现。

命名统一 `SupplierXxxView`，code review 必查。
漏一个字段就是泄露客户身份或对客价。

### 红线 3 — 一切锚定图纸版本
报价 / 订单 / 生产 / 质检 / 发货 **全部外键到 `part_revision_id`**，绝不锚定"最新版"。

图纸改版必须触发一次**显式的人工决策**（是否重新报价 / 是否影响在产订单），
不允许静默继承。制造业最经典的事故就是"按 Rev B 报的价、按 Rev C 生产"。

---

## 4. 目录结构

```
backend/src/main/java/com/mfg/
├── common/          跨领域基础设施（dto / exception / security / cache / service）
├── config/          @Configuration
├── platform/        平台与基础设施，无业务语义
│   party auth access file notification audit i18n fx dbmigration
└── domain/          业务核心
    lead rfq part sourcing pricing quote order production qc shipment
    document supplier settlement
```

**规则**

1. 域内固定四层：`controller/ service/ repository/ dto/`。单文件域保持扁平。
2. **定时任务 / 外部适配器 / 数据回填一律进 `service/`** —— 不另开 `scheduler/` `adapter/` 目录。
3. **不用 DDD 分层**（`api/application/domain/infrastructure`）。本系统 CRUD 为主，
   真正有领域逻辑的只有定价引擎一个模块，为它套全局 DDD 是过度设计。
4. 测试目录镜像主代码结构。
5. **不确定新域该放 `platform/` 还是 `domain/` → 停下来问。**
   不许先随便放、以后再搬 —— 表改名 + 包移动的代价远高于问一句。

**前端**

```
portal/src/
├── pages/
│   ├── customer/      欧洲客户端
│   ├── supplier/      供应商端
│   ├── ops/           内部后台
│   └── auth/          登录
├── components/
│   └── PortalGuard.tsx  ★端级路由闸门（体验层，不是安全边界）
├── auth/
│   └── session.ts     登录态存储
├── services/
│   ├── core/http.ts   ★唯一 HTTP 收口
│   ├── customer/      客户端 API
│   ├── supplier/      供应商端 API
│   └── ops/           后台 API
└── router.tsx         路由表
```

**每个新 service 文件必须在 `services/api.ts` 加一行 `export *`**，否则消费方看不到。

**页面目录一级 = 端**，和 URL 前缀、后端包结构三者对齐。
一个文件放错目录就意味着它的受众判断错了 —— review 时按目录看即可。

---

## 5. 数据隔离六条铁律 ★

这是本系统的安全核心。违反任何一条 = 安全 bug，不是代码风格问题。

1. **Service 写方法必须显式接收 `partyId` 参数。**
   不许从查出来的实体反推（`entity.getParty().getId()`），
   不许在 service 内部从 principal 默认取。由 controller 用 `@CurrentParty` 传进来。
   签名里没有 `partyId` 的租户范围写方法就是 bug。

2. **交易方范围的查询必须 `findByIdAndPartyId(id, partyId)`。**
   裸 `findById` 出现在业务代码里就是红旗 —— 它不管这行数据是谁的都返回。
   适用于 `@PathVariable` 的 ID、`@RequestParam` 的 ID、以及嵌在 `@RequestBody` 里的 ID。

3. **DTO 禁止接受客户端可控的身份和定价字段。**
   `partyId` / `customerId` / `supplierId` / `unitPrice` / `createdBy` 一律服务端推导。
   引用型字段（如 `partRevisionId`）可以收，但 service 必须校验该实体属于调用方。

4. **供应商端 response 白名单序列化。**（红线 2）

5. **公开端点（`/public/**`，无 JWT）的范围从资源反查。**
   绝不信客户端传的 party。如果端点带 token，每次请求都要验 token，不是只在创建时验。

6. **任何文件访问都要过一次"这个 principal 对这个 revision 有权"的显式校验 + 审计落库。**

### 端级硬闸门

```
/api/v1/customer/**   仅 CUSTOMER 类型 principal
/api/v1/supplier/**   仅 SUPPLIER 类型 principal
/api/v1/ops/**        仅 OPERATOR 类型 principal
/api/v1/public/**     无鉴权
```

`PortalGuardInterceptor` 是**第一道拦截器**，按 principal type 直接拒。
路径前缀即受众 —— 跨端泄露是本系统头号风险，粗闸门比细粒度更可靠。

细粒度权限只在 ops 端内部需要（销售/采购/质检/物流/财务/管理员），
走 `RouteAccessRegistry` 路由表 + 拦截器，**零注解** —— 新增端点只在路由表加一行。

### 类型陷阱

`UserPrincipal.getId()` 是 `UUID`（不是 String —— 这是刻意的选择，见 §11 C6）。
和实体 ID 比较时类型天然匹配，不会出现恒 false 的静默 bug。

---

## 6. 数据库

### 迁移

- 手写 `database/migrations/{YYYY-MM-DD}_{NN}_{slug}.sql`
  - 日期 = **编写日期**（不是合并日期）。CI 和 hook 拒绝未来日期。
  - `NN` 是两位序号 01–99，**同一天内全局唯一**。
    这是为了防字典序陷阱：`-`(0x2D) < `.`(0x2E)，`_slug-suffix.sql` 会排在 `_slug.sql` 前面。
- **必须幂等**：每条 DDL 用 `IF [NOT] EXISTS`
- **禁止 `DO $$` 块** —— 迁移执行器按 `;` 切语句，不认美元引号，
  内层的 `;` 会把块切碎，开机报 "Unterminated dollar quote"。
  需要函数就用单引号字符串形式定义函数体（见 `..._04_...sql` 的触发器）。
- 改动同步反映到 `database/schema.sql`
- **已应用文件的内容 hash 变了 = 开机报漂移错误。**要么撤销修改，要么新开一个文件。
- **所有环境跑同一套迁移，没有例外。**不允许某个环境用 `ddl-auto: update` 绕过。

### ★★ 迁移必须向后兼容一个版本（扩展-收缩）

**这条是自动部署带来的，不遵守迟早出线上事故。**

部署流程是「跑迁移 → 起新版本 → 健康检查不过就回滚 jar」。
关键在于：**回滚的只有 jar，数据库改动不回滚**。

```
部署 v2 ──▶ 迁移执行成功（schema 已经是 v2 的形状）
        └─▶ v2 应用启动失败 / 健康检查不过
            └─▶ 自动回滚到 v1 的 jar
                └─▶ ★ v1 的代码 面对 v2 的 schema
```

如果 v2 的迁移是「加一列」，v1 不认识这列，无所谓 —— 能正常跑。
如果是「删列」「列改名」「加 NOT NULL 约束」，v1 立刻炸，
而且是**回滚之后才炸** —— 你以为回滚救回来了，实际上服务还是挂的。

**所以破坏性变更必须拆成两次发布**（扩展-收缩 / expand-contract）：

| | 迁移 | 代码 |
|---|---|---|
| **第 1 次发布（扩展）** | 加新列，可空、无约束。旧列保留 | 同时写新旧两列，只读旧列 |
| **（中间）** | 回填历史数据 | 切成读新列 |
| **第 2 次发布（收缩）** | 加 NOT NULL / 删旧列 | 停止写旧列 |

两次发布之间要间隔到「确定不会回滚到上一版」为止。

**具体到本系统，下面这些一律要走两步**：
- 删列、列改名（`ALTER ... RENAME COLUMN`）
- 给已有列加 `NOT NULL`（先加默认值回填，再加约束）
- 收紧 `CHECK` 约束的取值范围（枚举加值是安全的，减值不是）
- 表改名（配套的 `DROP TABLE` 要放到第二次发布）

**判断方法**：问自己「**上一个版本的代码，面对这个迁移之后的库，还能不能跑**」。
不能，就得拆两步。

### 迁移是自动执行的，不要手工改生产库

`SchemaMigrationRunner` 开机自动应用 `database/migrations/` 下所有未应用的文件，
用 `pg_advisory_lock` 保证多实例并发启动时只有一个在跑。

- **单个迁移文件是原子的**（一个事务，含写 `schema_migrations` 记录）。
  但**文件与文件之间不是** —— 3 个文件跑到第 2 个失败，第 1 个已经生效了。
  所以一次发布尽量只带一个迁移文件。
- **绝不用 psql 直连生产库改结构。**手工改完，`schema_migrations` 里没有记录，
  下次部署迁移还会再跑一遍（撞已存在的对象），或者更糟 —— 因为写了
  `IF NOT EXISTS` 而静默跳过，从此本地和生产永久不一致，且没有任何东西会告诉你。
- 迁移在**端口打开之前**执行。大迁移会拉长启动时间，
  必要时调大 `deploy.sh` 的 `HEALTH_TIMEOUT`（默认 120 秒），否则会被误判成启动失败而回滚。

### 表改名必须配套删除

改名迁移必须**同 PR、同日**配一个 `DROP TABLE IF EXISTS old_name CASCADE`。

**为什么**：没有配套删除，后续某个迁移手滑写了 `CREATE TABLE IF NOT EXISTS old_name`，
会把空的旧表又建回来，每个长期环境都留下垃圾表，而且没人发现。

（注意这条和上面的扩展-收缩有张力：**改名本身要拆两次发布**，
配套的 `DROP TABLE` 放在第二次。同 PR 指的是同一个改名动作的两个迁移文件成对出现，
不是让你在第一次发布里就把旧表删掉。）

### JPA 三个必踩的坑

| 坑 | 正确写法 |
|---|---|
| `LocalDateTime` 与 schema 的 `timestamptz` 静默漂移 | `@Column(columnDefinition = "timestamp with time zone")` |
| jsonb 字段绑定失败 | `@JdbcTypeCode(SqlTypes.JSON)` + `columnDefinition = "jsonb"`（写 `"json"` 是坑） |
| 自定义 `@Query` 的 UUID 参数运行时绑定失败 | Repository 泛型必须匹配实体 `@Id` 类型；配 `hibernate.type.preferred_uuid_jdbc_type: VARCHAR` |

### 主键

全部 UUID（`@GeneratedValue(strategy = GenerationType.UUID)`），无例外。
高频只增日志表（`audit_event` / `file_access_log`）用 `bigserial`。

---

## 7. 命名与文案

### 表命名
平台表和业务表都不加前缀（单一业务系统，无需区分业务线）。
`order` 是 SQL 保留字 → 用 `sales_order`。

### ★ 后端只返 code，不返文案
本系统是三语的：EN/DE 给客户、中文给供应商和内部。

**后端返回的一切面向用户的内容都是 i18n code**，翻译全在前端。
包括：错误消息、状态名、邮件模板 key、通知内容、字段标签。

**Java 代码里禁止出现非 ASCII 字符串字面量**（有提交闸门拦截）。
注释可以写中文，字符串字面量不行。

### 审计动作命名
`<域>.<子域>.<动词>`，例：`quote.customer.send` / `quote.customer.accept` / `sourcing.dispatch`。

**状态流转有自己的动词**：`order.status_change`，
**不要**写成 `order.update` + payload 里带 `status=xxx`。查问题时天差地别。

**payload 只放**：ID / 枚举 / 计数 / 变更字段名集合。
**绝不放**：姓名 / 邮箱 / 电话 / 价格 / 自由文本 / 原始 IP / token。

---

## 8. 缓存

**不强制缓存。**有实测热点才加 —— 全量缓存是重大复杂度来源，收益不匹配。

用的时候遵守：

1. key 统一走 `CacheKeys`，禁止手写字符串拼接
2. 交易方范围的 key 必须带 `party:{partyId}:` 前缀
3. **只缓存 DTO，永不缓存 JPA 实体** ★

### 为什么不缓存实体

缓存命中返回的是 Jackson 反序列化的对象，`@ManyToOne(LAZY)` 关联是 `null`。
`repository.save(it)` 走 `merge` 会把关联外键写成 `NULL` → NOT NULL 约束炸。
而且**只在实体被读过一次进了缓存之后才复现**，mock 测试永远抓不到。

如果因为某些原因确实缓存了实体，那么：
**任何 `@Transactional` 里调 `save(entity)` / `delete(entity)` 的方法，
实体必须通过私有的 `loadManaged(partyId, id)` 直连 repository 加载，不能复用带缓存的 `findById`。**

---

## 9. 定时任务

**每个 `@Scheduled` 必须按条目加 Redis 锁。**

```java
String key = "lock:scheduler:quote-expiry:" + quoteId;
String fence = UUID.randomUUID().toString();
if (!redisService.setIfAbsent(key, fence, 120)) return;   // 别的 pod 在处理
try {
    doWork(quoteId);
} finally {
    redisService.releaseLock(key, fence);                  // 比对 fence 才删
}
```

DB 层必须有唯一索引兜底（防锁 TTL 到期后的重复执行）。

**禁止**：假设"我们现在只有一个 pod"；引入 leader election / 分布式锁表这类新基础设施。

本系统的定时任务：报价过期扫描、供应商报价过期提醒、生产里程碑逾期提醒、汇率同步、物流跟踪轮询。
**每一个都要加锁。**

---

## 10. 测试

两层，靠文件名后缀区分，这是权威判据：

| 后缀 | 层级 | 规则 |
|---|---|---|
| `*Test.java` | 单元测试 | mock 一切协作者 |
| `*IT.java` | 集成测试 | **必须真 PostgreSQL + 真 Redis** |

### 为什么禁止在 IT 里 mock Redis
缓存命中路径正是 Jackson / 泛型 / 懒加载 bug 的藏身之处。
mock 掉缓存的 IT 等于 CI 全绿着上线炸。
**Code review 时看到 `*IT.java` 里出现 `@MockitoBean RedisService` 直接打回。**

### 本项目的 IT 重点

**每个供应商端端点必须有一个负向测试**：
- 看不到别家供应商的报价
- 看不到客户身份（名称 / 国家 / 联系人 / 地址）
- 看不到对客价格

这三条做成测试基类的模板方法，新端点直接继承。

### 请求体构造
IT 的请求体必须走项目的 ObjectMapper（`postJson(path, body)` helper），
**不要手写 JSON 字符串** —— 手写的 key 拼错会静默绑成 null，测试照样"通过"。

---

## 11. 明确禁止的做法

这几条是从一个同栈生产系统（3200+ Java 文件）的真实事故里提炼的。

### C1 — 禁止前后端大小写自动转换 ★
**前后端统一 camelCase 到底。**Jackson 默认就是 camelCase，什么都不用配。
数据库列名用 snake_case，`@Column` 负责映射，仅此一处转换。

**为什么**：参考系统做了自动 camelCase↔snake_case 转换，为此攒了两组豁免名单，
每条都是一次线上 bug —— 流程图配置的 `actionType` 被转成 `action_type` 导致保存 400、
表单配置的 `ui.minSelect` 被转导致校验静默失效、snake 镜像 key 回写覆盖用户编辑。
**这是那个代码库里最大的一笔无谓技术债。**

### C2 — 禁止缓存 JPA 实体
见 §8。

### C3 — 禁止历史单据 join live 配置 ★
**已发出的报价、已确认的订单，其内容必须自包含。**

具体到本系统：`customer_quote_line` 必须存全量 `cost_breakdown` + `fx_rate` +
`pricing_rule_versions` 快照。渲染历史报价时**绝不去 join 当前的 `pricing_rule` 表**。

**为什么**：参考系统出过审批表单改模板后历史实例被篡改、进度修订 overlay 导致数字对不上，
根因都是同一个。而本系统的报价在法律上是要约，被篡改的后果更严重。

### C4 — 禁止 Java 里出现非 ASCII 字符串字面量
见 §7。有提交闸门拦截，diff-aware（只卡新增行）。

### C5 — 禁止硬编码 API 前缀 / 存储区域 / 短链域名
全部走配置。存储位置可配置是将来拆欧洲区的前提。

### C6 — `UserPrincipal.getId()` 用 `UUID` 类型，不用 `String`
参考系统用 String（JWT sub），和 UUID 实体 ID 比较时 `.equals()` 恒为 false
且**无编译警告**，因此出过两次水平越权 bug，最后不得不加一道专门的闸门。
**从源头用对类型，比事后加闸门好。**

### C7 — 禁止 `git add .`
只 add 明确要提交的文件。并行工作时 `git add .` 会把别人的在途改动一起卷走，
而且被卷走的新文件在 `git status` 里显示为 `M` 而不是 `??`，很难发现。

---

## 12. 提交与审查

### 提交格式

```
<Ticket>, <type>, <describe>
```

- **Ticket**：工单号 `[A-Z]+-[0-9]+`，无工单的紧急修复用 `#0`
- **type**：`feat / fix / perf / refactor / style / merge / revert / test / doc`（闭集）
- **describe**：**英文**，模块用 `[scope]` 前缀

```
MFG-12, feat, [quote] add validity-period guard on customer quote acceptance
MFG-31, fix, [sourcing] strip customer name from supplier package DTO
#0, doc, [docs] update migration naming rules
```

**整条消息（含正文）不许出现中文。**

### 提交前闸门（`.githooks/pre-commit`，全部 diff-aware）

| # | 闸门 | 防什么 |
|---|---|---|
| 1 | 迁移文件名（不许未来日期 + 序号全局唯一） | 迁移执行顺序错乱 |
| 2 | 密钥扫描（任何文件） | 密钥进 git 历史 = 强制去供应商侧轮换 |
| 3 | 遗留冲突标记 | `.sql` `.md` 没人解析，冲突标记能活到 psql 失败 |
| 4 | Java 非 ASCII 字符串字面量 | §7 / C4 |

**diff-aware 是精髓** —— 只卡新增/修改的行。这让你可以中途加新闸门而不用先还完债。

**新增闸门要三处同步**：`scripts/check-*.py` + `.githooks/pre-commit` + `.github/workflows/code-quality.yml`。

### 变更记录

非平凡改动必须配 `changelog/{YYYY-MM-DD}_{slug}/`：
`1-requirement.md`（需求 / 原话 / 背景 / 验收）、
`2-implementation-plan.md`（动手前对齐的计划，含被否决的方案）、
`3-changelog.md`（真实改动 + 部署清单 + 遗留项）。

**一分支一文件夹**，不是一 commit 一个。

**豁免**：一行修复、错别字、依赖升级、纯机械重构。
判据是「**光看 diff 会不会对"为什么"留下疑问**」—— 不会就不用写。

### 合并前五轴审查

见 `.github/PULL_REQUEST_TEMPLATE.md`。每项 ✓ / ✗ / N/A（写一行理由），
**不允许整轴一键勾**。

---

## 13. 开发环境

前置：**JDK 21**、Maven 3.9+、**Node 20+**、Docker。

```bash
# 一次性：激活 git hooks
./scripts/setup-hooks.sh

# 一次性：本地配置。★ 端口撞车时改 .env，不要改 docker-compose.yml
cp .env.example .env

# 起 PostgreSQL + Redis
docker compose up -d

# 前端（产物落进 backend/src/main/resources/static/）
cd portal && npm install && npm run build

# 后端（本地监听 3001，同时托管前端）
cd backend && mvn spring-boot:run
```

改前端时用 dev server，别每次重新 build：

```bash
cd portal && npm run dev     # :5173，API 自动 proxy 到 :3001
```

**★ 端口不要写死在 compose 文件里。**开发机上装了 brew 的 postgres、
或者别的项目的 compose 占着同一个端口，是常态。而撞车的表现极具误导性：
macOS 上 brew 的 postgres 绑 `127.0.0.1:5432`、docker 绑 `*:5432`，
两者能同时启动、`docker ps` 一切正常，但 `localhost:5432` 会优先命中 brew 那个 ——
应用报的是 `role "mfg" does not exist`，看起来像初始化没跑，实际是连错了库。

**验证命令**（声称完成前必须实际跑过，贴出输出）：

| 目的 | 命令 |
|---|---|
| 后端单测 | `mvn test` |
| 后端集成测试 | `mvn verify`（`mvn test` **不跑** `*IT.java`） |
| 前端类型检查 | `cd portal && npm run type-check` |
| 前端构建（含类型检查） | `cd portal && npm run build` |
| 冒烟 | `curl localhost:3001/api/v1/public/ping` |
| 探针 | `curl localhost:3001/actuator/health` |

**★ `npm run build` 会先跑 `tsc -b`。**不要为了「快一点」改成只跑 `vite build` ——
vite 用 esbuild 转译，**它不做类型检查**，类型错误会一路编译过去。
这不是假设：现有 `services/core/http.ts` 里 `requestBinary` 忘了把 `body`
从 `...rest` 解构出去，`unknown` 直接落进 `fetch` 的 `RequestInit`，
只有 `tsc` 抓得到，`vite build` 会照常出包，运行时把对象发成 `"[object Object]"`。
