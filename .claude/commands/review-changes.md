---
description: "对一段改动做多维度 Code Review：6 个 Agent 并行 + 数据库变更专项实测，输出中文报告"
argument-hint: "<基准 commit / 分支，如 7b0827a 或 origin/main。留空则用 HEAD~1>"
allowed-tools: ["Agent", "Bash", "Glob", "Grep", "Read", "TaskOutput"]
---

# 改动评审（6 Agent 并行 + 数据库专项实测）

对一段改动做全面审查，综合后输出**中文**报告到终端。

**输入：** `$ARGUMENTS` —— 基准 commit 或分支。留空则用 `HEAD~1`。

> **★ 这个命令审的是本地 commit 范围，不是 GitHub PR。**
> 本仓库是 trunk-based，直接往 `main` 提交，没有 PR 流程；而且当前 `gh` 登录的账号
> 解析不到 `yubeining/yuhao_website`。原版命令那套 `gh pr view` / `gh pr diff` /
> 回帖到 PR 评论在这里全部跑不通，所以改成 `git diff`。
> 将来真开始走 PR 了，把阶段 1 换成 `gh pr diff <编号>` 即可，其余阶段不用动。
>
> **和内置 `/code-review` 的关系**：内置那个更快、覆盖通用正确性。这个命令的独有价值是
> **阶段 2.5 的数据库专项**和**对照 CLAUDE.md 逐条查项目铁律**。改动碰了迁移或查询就用这个。

---

## 阶段 0: 前置检查

`pr-review-toolkit` plugin 提供阶段 2 的 6 个 Agent。确认它可用：

```bash
grep -o 'pr-review-toolkit@[^"]*' ~/.claude/plugins/installed_plugins.json | head -1
```

没有输出就终止，并告诉用户：`/plugin install pr-review-toolkit`。

---

## 阶段 1: 取 diff

```bash
BASE="${ARGUMENTS:-HEAD~1}"
git log --oneline "$BASE..HEAD"
git diff --stat "$BASE..HEAD"
git diff "$BASE..HEAD" > /tmp/review-diff.patch
wc -l /tmp/review-diff.patch
```

**★ 用两点 `..`，不要三点 `...`。** 三点求的是「从共同祖先起」，当前分支就是 `main`、
基准也在 `main` 上时结果恒为空，整个命令会静默产出零变更、报告一片绿。

diff 超过 2000 行新增时，在 Agent prompt 里注明优先看 `.java` / `.sql` / `.ts`，
降低静态资源和构建产物的优先级。

再读一遍 `CLAUDE.md`，把项目铁律摘出来作为审查依据传给每个 Agent。

---

## 阶段 2: 并行启动 6 个 Review Agent

**必须在单条消息里同时发起 6 个 Agent 调用，全部 `run_in_background: true`。**

### 范围约束（6 个 Agent 共同遵守）

每个 Agent 的 prompt 里必须原样包含：

> **SCOPE RULE: Only review code that was ADDED or MODIFIED in this diff (lines starting with `+`). Do NOT flag pre-existing issues in surrounding unchanged context lines. Do NOT review files not touched by this diff. If an issue exists in old code that this change did not modify, ignore it completely. Only report problems introduced or worsened by these changes.**

目的是：既有问题不产生噪音、不计入严重等级统计，聚焦本次引入的新问题。

> **EXCEPTION（唯一例外）**：改动涉及 `@Transactional` 的 `propagation` / `isolation` /
> `rollbackFor` 变更，或自注入重构时，**可以**检查未改动的调用方行为 ——
> AOP 代理和传播行为的变更会改变**所有**已有调用点的运行时语义，
> diff 看着无辜，既有调用方可能被静默改坏。

### [CRITICAL] 数据库变更专项规则（6 个 Agent 共同遵守）

diff 碰到下面任一处时**必须**做数据库专项审查 —— 这是 SCOPE RULE 的例外：
**即使 diff 很小（往往只是加一个按列查询），也要看索引覆盖**。

> 触发面：`database/migrations/**.sql` · `database/schema.sql` ·
> 任何 `@Query` / 原生 SQL · Repository 接口新增查询方法（含 Spring Data 方法名派生查询）·
> Entity 新增字段 · 含 `CREATE` / `ALTER` / `DROP` / `INDEX` 的 `.sql`。

**★ 本仓库为什么这条格外重要**：CLAUDE.md §4 禁止一切数据库外键，
关联全靠裸 `uuid` 列表达。规范里那句话是关键 ——
「**必须显式建索引 —— 这些列全是 join / filter 主力，而没有外键就没人替你建**」。
别的项目里外键会顺带带来索引，这里不会。**新增一个 `xxx_id` 列而没有配套索引，
是本仓库最容易发生、也最容易漏审的性能事故来源。**

审查维度（命中即按对应严重级报告）：

1. **[CRITICAL] 索引覆盖** —— 新增/修改查询的 `WHERE` / `JOIN` / `ORDER BY` 过滤列，
   在目标表上是否有索引。Spring Data 的方法名派生查询（`findByCustomerOrgIdAndStatus`）
   尤其要确认：它不会提示你缺索引，只会慢。
2. **[CRITICAL] 新增 uuid 关联列无索引** —— 见上。新加 `xxx_id` 必须同一个迁移里配 `CREATE INDEX`。
3. **[HIGH] 慢查询占连接 → 连接池耗尽** —— Hikari 池上限 20（`application.yml`）。
   一条全表扫的慢查询长期占住连接，并发叠加会耗尽池子，表现为整体读失败而不是单点变慢。
4. **[HIGH] 结果集有界 / N+1** —— 分页必须走 `PageQuery`（全局 size 上限）；
   循环里逐条查库要改成批量 `IN`。CLAUDE.md §4 禁 JPA 关联注解，
   所以 N+1 通常表现为 service 里的 for 循环，不是 LAZY 代理。
5. **[HIGH] 迁移安全** —— 是否幂等（`IF [NOT] EXISTS`）；是否含 `DO $$` 块（执行器按 `;` 切语句，
   会切碎报 `Unterminated dollar quote`）；破坏性变更是否拆了扩展-收缩两步（CLAUDE.md §5）；
   大表加索引是否用 `CREATE INDEX CONCURRENTLY`（Postgres，避免锁表）；
   `database/schema.sql` 是否**同一次提交**同步（`check-schema-sync.py` 是硬闸门）。
6. **索引失效写法** —— 索引列上加函数或隐式类型转换、`LIKE '%x'` 前导通配、
   不满足复合索引最左前缀、`OR` / `!=` / `NOT IN` / `IS NULL`。

> 6 个 Agent 是纯文本分析器，**没有数据库连接，只能基于 diff 文本猜索引**。
> 真正的核实由主流程在**阶段 2.5** 实际跑 EXPLAIN 完成。Agent 负责提醒，阶段 2.5 负责判定。

每个 Agent 的 prompt 还必须包含：diff 文件路径（`/tmp/review-diff.patch`）、
技术栈上下文（Java 25 / Spring Boot 4.1 / JPA / PostgreSQL / Redis / Vite+React SPA）、
以及从 CLAUDE.md 摘出的铁律。

### Agent 1: `pr-review-toolkit:code-reviewer`
质量、项目规范合规、安全漏洞、逻辑 bug。逐条对照 CLAUDE.md，重点是
§3 安全铁律（租户 id 必须进查询条件、DTO 白名单序列化 `XxxView`、公开端点范围从资源反查）、
§4（禁外键、禁 JPA 关联注解、时间用 `Instant`、jsonb 用 `@JdbcTypeCode(SqlTypes.JSON)`）、
§6（Java 里禁非 ASCII 字符串字面量，只返 i18n code 不返文案）。
碰 SQL/迁移/Repository 时按上文数据库专项规则查。

### Agent 2: `pr-review-toolkit:silent-failure-hunter`
错误处理审计、静默失败、Spring 事务时序。重点：
新增错误分支有没有日志或用户反馈；吞异常的 try-catch；
fire-and-forget 的异步调用；资源泄漏；竞态。
**[事务专项]** 碰 `@Transactional` / `Propagation` 时查：
内层 `REQUIRES_NEW` 是否依赖外层未提交的写入；
`this.transactionalMethod()` 自调用导致注解静默失效；
同类型自注入字段（`@Resource SameType self`）在某些 Spring 版本下不走代理；
事务方法体内 `Thread.sleep` + 锁重试（占连接、易死锁）。
**[本仓库专项]** 定时任务是否按 CLAUDE.md §8 加了 Redis 锁并带 fence 比对；
DB 层有没有唯一索引兜底（防锁 TTL 到期后重复执行）。

### Agent 3: `pr-review-toolkit:code-simplifier`
简化机会。**prompt 里必须明确写 "DO NOT modify any files, just provide analysis"。**
只分析新增代码：重复模式、过深嵌套、过度防御性编码、可更简洁的写法。

### Agent 4: `pr-review-toolkit:comment-analyzer`
只看新增/修改的注释是否准确描述了代码行为，以及本次改动是否让附近的既有注释过时了。
本仓库注释可以是中文（只有字符串字面量禁非 ASCII），不要把中文注释当问题报。
无注释变更就直接返回「本次无注释变更」。

### Agent 5: `pr-review-toolkit:pr-test-analyzer`
只分析本次新增/修改的功能有没有测试覆盖。
**必须区分 `*Test.java`（`mvn test` 跑）和 `*IT.java`（**只有 `mvn verify` 跑**）**——
两者混记会高估 PR 上的实际保护。
**必须核实断言真的覆盖到改动分支，而不是「有同名测试文件就算覆盖」。**
按 CLAUDE.md §9：IT 里 mock 掉 Redis 的直接打回。

### Agent 6: `pr-review-toolkit:type-design-analyzer`
新增类型的封装性与不变量表达。本仓库专项：
principal 的 id 必须是 `UUID` 不是 `String`（两者 `.equals()` 恒 false 且无编译警告，直接是水平越权）；
`domain/` 下的 Entity 和 Repository 必须包级私有（ArchUnit 已钉，但新加的域要看）。

---

## 阶段 2.5: 数据库变更专项实测（主流程执行，与 6 个 Agent 并行）

**仅当 diff 命中上文触发面时执行；否则跳过并在报告里写「无数据库变更」。**

### 2.5.1 提取变更的查询

```bash
git diff "$BASE..HEAD" -- 'database/**/*.sql' '**/*Repository.java' '**/*.java'
```

分三类：
- **迁移 DDL**：`database/migrations/*.sql` 里的 `CREATE TABLE` / `ALTER TABLE` / `CREATE INDEX`
- **Spring Data 方法名派生查询**：Repository 接口里新增的 `findByXxx` / `existsByXxx` / `countByXxx`
  —— 从方法名还原过滤列（camel → snake），这是确定性的
- **`@Query` 显式 SQL/JPQL**：直接取

难还原的（运行时拼条件、Specification、Criteria）→ 标 `MANUAL_EXPLAIN_REQUIRED`，**绝不静默放过**。

### 2.5.2 验证索引（先离线，再实测）

**(A) 离线比对（首选，最快）** —— 把还原出的过滤列和 `database/schema.sql` 里的
`CREATE INDEX` / `PRIMARY KEY` / `UNIQUE` 定义比对。过滤列**不是任何索引的最左列** → 报问题。
这一步不用连库，性价比最高。

**(B) 本地 EXPLAIN（二次确认）** —— 本机有 Postgres，可以真跑：

```bash
docker exec mfg-postgres psql -U mfg -d mfg -c "EXPLAIN <还原出的 SQL>"
```

参数用类型匹配的安全常量替换（uuid → `'00000000-0000-0000-0000-000000000000'::uuid`，
text → `'x'`，timestamptz → `'2020-01-01T00:00:00Z'`）。
**只跑 `EXPLAIN`，禁 `EXPLAIN ANALYZE`，禁取业务数据。**

### 2.5.3 判定

Postgres 的执行计划关键词和 MySQL 不同，别照搬 `type=ALL` 那套：

| 计划里出现 | 判定 |
|---|---|
| `Seq Scan` + 有过滤条件 | 缺索引 → HIGH；表预期会长大 → **CRITICAL** |
| `Index Scan` / `Index Only Scan` / `Bitmap Index Scan` | OK |
| `Sort` + `external merge Disk` | MEDIUM |
| `Nested Loop` 且内层是 `Seq Scan` | HIGH |

> **当前所有表都是空的**（业务未开始），所以 Postgres 会对小表**故意选 `Seq Scan`** ——
> 空表上的 `Seq Scan` 不算问题。**判据以离线比对 (A) 为准，EXPLAIN 只作参考。**
> 等有了真实数据量再反过来。这一条现在必须写明，否则报告会满屏假警报。

### 2.5.4 产出（并入阶段 4）

每条查询给出：`文件:行` + 还原的过滤列 + 索引比对结果 + 判定级别 + 修复建议。
缺索引的修复建议要给出可直接用的 DDL：

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS <表>_<列>_idx ON <表> (<列>);
```

（`CONCURRENTLY` 不能在事务里跑，而迁移执行器是按文件包事务的 ——
所以本仓库的迁移里**先不要用 `CONCURRENTLY`**，表还小，普通 `CREATE INDEX` 即可；
将来表大了要加索引，单独走一次运维操作。这一点要在建议里说清楚，别让人照抄进迁移文件。）

`MANUAL_EXPLAIN_REQUIRED` 的查询单列一张「需人工确认」清单。

---

## 阶段 3: 等所有 Agent 完成

用 `TaskOutput`（`block: true`）等 6 个 Agent。
单个 Agent 超时（5 分钟）就用已完成的结果继续，并在报告里注明哪个超时了。

---

## 阶段 4: 综合报告

把 6 份报告 + 阶段 2.5 的结果**去重、交叉验证、合并**成一份中文报告。

**★ 主流程必须自己复核，不许直接转述。** Agent 是顾问，你是决策者。
尤其要做两件事：
1. **核实关键结论**。Agent 说「缺索引」「有越权」「测试没覆盖」，你要自己去看那个文件确认。
   报出去一条假的，下次没人再信这份报告。
2. **发现互相矛盾时**，深入分析矛盾原因，必要时交给用户裁决，不要挑一个顺眼的写进去。

### 去重
多个 Agent 报同一问题 → 合并为一条，取最高严重等级，保留所有来源 Agent 名。

**★ 去重要按「覆盖的分支」比对，不是按名字比对。** 两条看着一样的发现，
可能覆盖的是同一函数的不同分支，合并会丢信息。

### 严重等级
- **CRITICAL**：运行时崩溃、安全漏洞（越权 / 泄露 / 认证绕过）、数据丢失、缺索引的大表查询
- **HIGH**：静默失败、资源泄漏、规范强制项违反、事务语义错误
- **MEDIUM**：类型安全、命名、可维护性
- **LOW**：风格、简化建议

### 结论判定
- ✅ **可以合入**：无 CRITICAL，HIGH ≤ 2
- ⚠️ **改完再合**：有 CRITICAL，或 HIGH > 2
- ❌ **暂不合入**：CRITICAL ≥ 3，或存在安全漏洞

### 报告格式

```markdown
# 改动评审报告

范围：<BASE>..HEAD ｜ N 个提交 ｜ M 个文件 ｜ +X / −Y

## 审查结论：✅/⚠️/❌ <一句话>

## 关键问题（必须修复）
### 1. <标题>
- 位置：<文件:行>
- 问题：<一句话说清>
- 影响：<会导致什么>
- 建议：<怎么改>
- 来源：<Agent 名>｜主流程已复核：是/否

## 重要问题（建议修复）
（同上格式）

## 数据库变更专项
（无变更就写「本次无数据库变更」）

## 测试覆盖
（区分 *Test 与 *IT）

## 其他（类型设计 / 注释 / 简化机会）

## 总结
<2-3 句：这次改动整体怎么样，最该先动哪一条>
```

### 裁剪
LOW 问题超过 5 条就只列前 5 条 + 一句「另有 N 条风格建议，未逐条列出」。
报告正文控制在 200 行以内 —— 太长没人看完，等于没写。

---

## 错误处理

| 情况 | 做法 |
|---|---|
| `$BASE..HEAD` 是空 diff | 停下来告诉用户，别产出一份全绿的空报告。先确认基准对不对（是不是误用了三点语法） |
| plugin 不可用 | 阶段 0 就终止，给安装命令 |
| 某个 Agent 超时 | 用剩下的继续，报告里注明 |
| 本地 Postgres 没起 | 跳过 2.5.2(B)，只做离线比对 (A)，报告里注明 EXPLAIN 未实测 |

---

## 用法

```
/review-changes 7b0827a          # 审 7b0827a 到 HEAD
/review-changes origin/main      # 审本地领先远端的部分
/review-changes                  # 审最后一个提交
```
