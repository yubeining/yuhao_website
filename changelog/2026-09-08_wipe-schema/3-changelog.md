# 变更记录 —— 清空全部表 + 移除 domain 代码,schema 归零重建

> 2026-09-08 ｜ 破坏性 ｜ 新迁移 + 删 domain 代码 + 删测试

## 为什么

2026-08-02 的 bootstrap 一次性铺了整套业务 schema(31 张表 + 1 个触发器函数 + 1 个视图),
但其中 26 张至今无任何代码在用 —— 与「建表前先判业务含义、按需建」(CLAUDE.md §4)相悖。
经确认:**业务尚未开工,把 schema 全部清空,由使用方从零按自己的方式重建**;
连同依赖这些表的 domain 代码(账号 / 审计 / access)一并移除,仓库回到「只有平台基建、
domain 归零」的干净、可编译、可启动状态。

## 删了什么

### 迁移(新增一个 wipe)
- `2026-09-08_03_wipe-all-tables.sql`:`DROP TABLE IF EXISTS ... CASCADE` 清掉全部 31 张表
  (CASCADE 连带清掉 `production_order_item` 的触发器和依赖视图 `order_line_allocation`,
  以及各 bigserial 自持序列)+ `DROP FUNCTION check_production_allocation()`。
  **保留 `schema_migrations`(迁移账本)**。
  - 历史 create 迁移**不删**(§5:已应用文件不可改,且 DevBox 库已应用过它们)——
    保留 create→wipe 的真实历史,重建走 wipe 之后的新迁移。
- `database/schema.sql` 重新生成 → 0 表 0 外键。

### 移除的 domain 代码(依赖被删表)
- **账号(platform/auth)**:`OpsUser` `Party` `PartyUser`(实体)+ 三个 Repository +
  `AuthService` `LoginController` `RefreshTokenService` `DevAccountSeeder`。
- **审计(platform/audit,整包)**:`AuditEvent` `AuditEventRepository` `AuditService`
  `AuditLog` `AuditLogAspect` `StartupAuditRecorder`。
- **access(platform/access,整包)**:`AccessGrantRepository` `AccessInterceptor` `RouteAccessRegistry`。
- `WebMvcConfig`:摘掉 `AccessInterceptor` 的注册与注入(order(2) 那道)。
- 删对应测试:`AuthServiceTest` `RefreshTokenServiceIT` `AccessInterceptorTest` `OptimisticLockingIT`。

## 保留了什么(平台基建,不碰表)
- **安全网关全套**:`JwtService` `JwtAuthFilter` `SecurityConfig` + `common/security/*`
  (`UserPrincipal` `PartyType` `AuthContext` `PortalGuardInterceptor` `CurrentUser/Party` 解析器)
  + `WhoAmIController`(端级探针,只读 principal,无库依赖)。`PortalGuardIT` 仍绿,网关可测。
- 其余基建:线程池 / 存储 / AI / 限流(`@RateLimit`)/ 幂等(`@Idempotent`)/ 可观测
  (traceId、`RequestContext`、MDC)/ 迁移执行器 / `BaseEntity`(`@MappedSuperclass`,无表)。

## 验证(跑过,真 PG + Redis)
```
全部 8 个迁移依序应用到快照库 → 应用后剩余表 = 0(wipe 生效,含 CASCADE 掉视图)
mvn verify:单测 16 + 集成 18(S3/AI 4 例无凭证 skip),PortalGuardIT 7 绿,BUILD SUCCESS
后端零实体启动:validate 模式无表可验,上下文正常起
```

## 部署清单
- **一个新迁移,开机自动应用**:在 DevBox 库上 `DROP` 掉这 31 张表 —— **不可逆,会清数据**。
  当前无业务数据,确认后再部署。迁移在端口打开前执行。
- 回滚安全:旧 jar 不依赖这些表存在;新 jar 也不映射它们。此方向不需要扩展-收缩。

## 遗留项(留给重建)
- 生产环境**暂时无法登录**:`LoginController` 已删,没有发 token 的入口(网关仍能校验 token)。
  账号体系由使用方重建时一并补回。
- `application.yml` 的 `app.auth.dev-seed`、`AppProperties.auth().devSeed()` 成为孤儿配置
  (无人消费,不影响启动);`app.auth.login.*` 仍被 `@RateLimit` 占位符引用,保留。
- 重建时:新表走 wipe 之后的新迁移文件;需要账号/审计/access 时按 §4「先判业务含义」重新设计。
