# 实施计划 —— 后端基础设施骨架

> 2026-09-07 ｜ 动手前对齐

## 必须做

**持久层** `platform/persistence` + `config`
- `BaseEntity`（@MappedSuperclass + AuditingEntityListener）：`UUID id`（应用侧生成）、
  `Instant createdAt/updatedAt`（timestamptz，@CreatedDate/@LastModifiedDate）。
  equals/hashCode 对 Hibernate 代理安全、hashCode 用类型不用 id。
- `JpaAuditingConfig`（@EnableJpaAuditing）。不配 AuditorAware —— "谁创建的"走审计事件，不从 SecurityContext 偷。
- 日志表（audit_event / file_access_log，bigserial）不继承基类。

**线程池** `config/AsyncConfig` + `platform/async`
- `@EnableAsync`；`appTaskExecutor`（有界队列 + CallerRuns 背压 + 命名线程 + 优雅关闭）。
- `taskScheduler`（替换 @Scheduled 的默认单线程）。
- `AfterCommitExecutor`：事务提交后把副作用丢到 appTaskExecutor（文档3 §4）。

**OSS** `platform/storage` + `config/StorageConfig`
- `StorageService` 接口（单桶、key 为参、只私有 + 签名 URL）+ `StorageObjectMeta` + `StorageException`。
- `S3StorageService`（AWS SDK v2）+ `MemoryStorageService`（本地/测试）。
- `StorageConfig` 按 provider 选实现；★ client 用内网 endpoint、presigner 用外网 public-endpoint。
- pom 换 google-cloud-storage → aws sdk v2（BOM）。

## 关键决策

| 点 | 选择 | 为什么 |
|---|---|---|
| S3 客户端 | **AWS SDK v2** | 官方、provider 中立（D1 存储可迁移）、签名 URL 内置；Sealos MinIO 协议兼容（curl 已验） |
| 桶是参数还是配置 | **配置**（单桶，方法只收 key） | 少一个能填错的地方；当前就一个私有桶 |
| 公开读 | **不做** | 图纸一律私有，对外只给短期签名 URL —— 红线 1 每次签发能落审计的前提 |
| 内外网端点 | **拆两个**（client 内网 / presigner 外网） | 签名 URL 给欧洲浏览器点，必须是公网 host；服务端走内网省流量 |
| 配置注入 | **@Value**（不用 @ConfigurationProperties） | 跟现有代码一致（JwtService / RedisService 都 @Value） |
| 实体基类 | **有 BaseEntity** | §4 的 UUID/Instant/timestamptz 约定收一处，防每个域重抄踩坑 |

## 被否决 / 不做

| 方案 | 为什么不 |
|---|---|
| MinIO Java 客户端 | 绑 MinIO，换真 AWS / 阿里 OSS 要重写；AWS SDK v2 藏在接口后照样连 MinIO |
| S3 impl 先留空壳 | 凭据已验证可用，现在就能写能测的真实现，没理由拖 |
| 全量缓存层 / 缓存注解框架 | CLAUDE.md §7：不强制缓存，有实测热点才加。RedisService 够用 |
| 引入 leader election / 分布式调度框架 | §8 明确禁止；@Scheduled + Redis 锁足够 |
| public-bucket（设计稿的公私双桶） | MVP 单桶、全私有；脱敏/公开预览是后面的事（D19 脱敏后置） |

## 边界（本次不做，属文件/图纸域）

- file_object 上传编排、签名 URL 确认流、**红线 1 的访问审计**。StorageService 只管存取字节；
  "谁能看这个 key" + 落 file_access_log 是文件域接 StorageService 时做。

## 验证

- `MemoryStorageServiceTest`（单测，行为契约）。
- `S3StorageServiceIT`（对真桶 put/get/head/delete + HttpClient 下载签名 URL），凭据只从环境读、缺省跳过。
- 全上下文启动（PortalGuardIT，test profile = memory provider）确认新 bean 装配无冲突。
