# 变更记录 —— 8 项企业级基建（借鉴 WeAct/webox）

> 2026-09-08 ｜ 平台层 ｜ 无 schema、无 domain

## 依赖

`pom.xml` 加：`spring-boot-starter-aop`（切面）、`micrometer-registry-prometheus`（指标）、
`archunit-junit5:1.3.0`（test）。

## 1. Prometheus 指标 + 探针
- `application.yml`：actuator 暴露加 `prometheus`；`health.probes.enabled=true`（liveness/readiness）。
- `config/MetricsConfig`：`MeterRegistryCustomizer` 加公共标签 `application` / `environment`（用 MeterFilter 保证早于任何指标注册）。
- 验证：`/actuator/prometheus` 返回带 `application="mfg-backend",environment="local"` 的指标；`/health/liveness`、`/readiness` 各 200。

## 2. ArchUnit 架构测试
- `test/arch/ArchitectureTest`（5 条，显式 @Test + rule.check）：禁 JPA 关联注解（§4）、禁字段 @Autowired、禁 System.out/err、禁 java.util.logging、controller 不依赖 repository（现无 controller 包，allowEmptyShould）。
- 现有代码库 4 条实测干净通过。

## 3. 每子系统独立线程池
- `config/AsyncConfig`：新增 `notificationExecutor`（core2/max8/queue500，独立于通用 `appTaskExecutor`）。
- `platform/async/AfterCommitExecutor`：加 `executeOn(Executor, Runnable)`，副作用可落指定池。
- `NotificationService.notify` 改走 notificationExecutor —— 外部发信变慢只堵自己的池。

## 4. 集成测试基类
- `test/support/AbstractIntegrationTest`（真库真 Redis，@BeforeEach TRUNCATE 全表 + flush Redis db15）。
- `RateLimiterIT` / `RefreshTokenServiceIT` / `OptimisticLockingIT` 迁移继承它，去掉重复注解。

## 5. @Idempotent 幂等
- `platform/idempotency/Idempotent` 注解 + `IdempotencyAspect`（Redis SETNX 抢占，SpEL 取 key，重复抛 409，失败释放锁可重试）。
- `IdempotencyAspectIT`（真 Redis）2 例：重复被拒 + 异 key 放行、失败可重试。

## 6. 声明式审计 @AuditLog + 脱敏
- `platform/audit/AuditLog` 注解 + `AuditLogAspect`（成功后落 audit_event，actor 从 principal 取，targetId 走 SpEL；payload 只放 method 名，不放 PII）。
- `common/util/SensitiveData`（maskEmail / maskPhone）；`EmailSender` 改用它（去掉自己的 mask 重复）。
- 已知边界：审计仍在业务事务内（REQUIRED），后续改 REQUIRES_NEW 解耦（图纸访问审计红线另处理）。

## 7. AI 多 provider 抽象
- `platform/ai`：`AiProvider` 接口 + `AiModelRegistry`（按名字路由，加 provider = 加一个类）+ `DefaultAiService` 门面。
- `SpringAiService` → `SealosAiProvider implements AiProvider`（name=sealos）。`AiRequest` 加 `provider` 字段。
- 对外仍是 `AiService`；`AiServiceIT` 真调 Sealos 端点照常通过。

## 8. typed 配置树
- `config/AppProperties`（@ConfigurationProperties record，@DefaultValue）：收口 async / scheduler / auth.login / auth.devSeed。
- `MfgApplication` 加 `@ConfigurationPropertiesScan`。
- 迁移 `AsyncConfig`（8 个 @Value → 一个 AppProperties）、`LoginController`、`DevAccountSeeder`。
- jwt / storage / ai 暂留 @Value，可后续并进来。

## 验证

- `mvn verify` 全绿（S3/AI IT 无凭据跳过）：ArchUnit 5、IdempotencyAspectIT 2、迁移的 3 个 IT、其余照常。
- 真库打包启动：探针 200、prometheus 带公共标签、AppProperties 绑定生效、无启动报错。

## 部署清单

- 无迁移、无新密钥。合并即生效。
- 新增 `/actuator/prometheus`（可对接监控）；`/actuator/health/{liveness,readiness}` 供 k8s 探针配置。

## 遗留项

| # | 事项 |
|---|---|
| 1 | typed 配置只迁了 async/scheduler/auth，jwt/storage/ai 后续并入 |
| 2 | @AuditLog 的审计事务改 REQUIRES_NEW（连同图纸访问审计红线一起做） |
| 3 | 更多子系统独立池（AI 异步等）按需再加 |
| 4 | ArchUnit 分层规则待域四层就位后真正生效（现 allowEmptyShould） |
