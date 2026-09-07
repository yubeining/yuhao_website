# 变更记录 —— 后端基础设施骨架

> 2026-09-07 ｜ 平台层新增，`domain/` 未动 ｜ 无 schema 变更

## 新增

**持久层**
- `platform/persistence/BaseEntity`（@MappedSuperclass）：UUID 主键 + `Instant` 时间戳（timestamptz），
  代理安全的 equals/hashCode。
- `config/JpaAuditingConfig`（@EnableJpaAuditing）。

**线程池**
- `config/AsyncConfig`（@EnableAsync）：`appTaskExecutor`（有界 + CallerRuns + `mfg-async-` + 优雅关闭）、
  `taskScheduler`（`mfg-sched-`，替换默认单线程调度器）、@Async 默认执行器与未捕获异常处理。
- `platform/async/AfterCommitExecutor`：事务提交后异步跑副作用（文档3 §4）。

**对象存储**
- `platform/storage/`：`StorageService` 接口、`StorageObjectMeta`、`StorageException`、
  `S3StorageService`（AWS SDK v2）、`MemoryStorageService`。
- `config/StorageConfig`：按 `app.storage.provider`（s3 / memory）装配；client 走内网 endpoint、
  presigner 走外网 public-endpoint。

## 修改

- `pom.xml`：删 `google-cloud-storage`；加 AWS SDK v2（`software.amazon.awssdk:s3`，版本走 BOM 2.31.0）。
- `application.yml`：`app.storage` 重构（provider 默认 gcs→s3，去掉 private/public-bucket，加 `s3.*`：
  endpoint / public-endpoint / region / bucket / access-key / secret-key / path-style）；新增 `app.async.*`、`app.scheduler.*`。
- `application-test.yml`：已有 `storage.provider: memory`，无需改。
- `deploy/README.md`：Variables 段补 `STORAGE_S3_PUBLIC_ENDPOINT`（内外网端点说明）。

## 测试（跑过，贴输出）

仓库第二批测试。

```
MemoryStorageServiceTest        Tests run: 5, Failures: 0, Errors: 0
S3StorageServiceIT (真桶)        Tests run: 2, Failures: 0, Errors: 0   ← put/get/head/delete + HttpClient 下载签名 URL
PortalGuardIT (全上下文启动)      Tests run: 7, Failures: 0, Errors: 0   ← 新 bean 装配无冲突
```

S3 IT 命令（凭据只从环境读，不写进代码；CI 无凭据自动跳过）：

```
S3_IT_ACCESS_KEY=xxx S3_IT_SECRET_KEY=yyy mvn failsafe:integration-test -Dit.test=S3StorageServiceIT
```

编译：`mvn compile` BUILD SUCCESS（AWS SDK v2 依赖解析正常）。

## 边界 / 遗留项

| # | 事项 |
|---|---|
| 1 | StorageService 只存取字节。红线 1（每次访问落 file_access_log）+ 鉴权在文件/图纸域接 StorageService 时做 |
| 2 | 线上要配 `STORAGE_S3_PUBLIC_ENDPOINT`（外网），否则签名 URL 指向内网、客户打不开 |
| 3 | `@Scheduled` 任务本身还没有；写第一个时按 §8 加 Redis 锁（RedisService 已就绪） |
| 4 | provider 只认 s3 / memory；老的 `gcs` 值会让启动失败并给出明确提示 |

## 部署清单

- 无迁移。合并后下次部署会用新 `application.yml`；线上 `STORAGE_PROVIDER` 目前应为 s3（默认），
  首次真正用到存储前，去 GitHub Variables 补 `STORAGE_S3_ENDPOINT`（内网）/ `STORAGE_S3_PUBLIC_ENDPOINT`（外网）。
- 应用启动不依赖存储可达（只有真正 put/get 时才连），所以本次合并不影响现有部署。
