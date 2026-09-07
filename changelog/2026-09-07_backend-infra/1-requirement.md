# 需求 —— 后端基础设施骨架

> 提出日期：2026-09-07 ｜ 提出人：项目负责人

## 原话

> 「先把后端架构搭好 比如数据库的服务 redis的服务 线程池的统一 oss的服务 这些需要规定好」

追问 S3 客户端库时（解释了 curl 能连 ≠ Java 不用 SDK）：

> 「AWS SDK v2，开写吧」

## 背景

写业务域之前，先把 `platform/` 层的公共基础设施规定好，否则每个域各写各的，
风格分叉、约定漂移。核对现状：

- **Redis**：已完整（`RedisService` 缓存 + 带 fence 的分布式锁，`CacheKeys` 集中 key 表）——不用动。
- **数据库**：连接池 / JPA(validate) / 迁移都在，但**没有实体基类** —— 每个未来实体的
  id、时间戳字段没有统一出处，容易各写各的、踩 §4 的 `LocalDateTime` 漂移坑。
- **线程池**：`@EnableScheduling` 开着但**没有任何 async executor** —— 异步任务会落到
  Spring 默认的无界 `SimpleAsyncTaskExecutor`（每任务开新线程），定时任务默认单线程会互相堵。
- **OSS**：配置项在，但**零代码**，且 pom 里是 `google-cloud-storage`（GCS 在境内不可用），
  和已定的 Sealos OSS（D21）不符。

## 验收

1. `platform/` 下有可复用的四块基础设施，业务域直接用，不各写各的：
   - 实体基类（UUID 主键 + Instant 时间戳，§4 约定收在一处）；
   - 统一线程池（有界、命名、优雅关闭）+ 事务提交后执行副作用的入口（落地文档3 §4）；
   - 对象存储服务（接口 + S3 实现 + 内存实现，provider 可切）；
   - Redis 已有，确认不重复造。
2. S3 用 AWS SDK v2，实现藏在接口后（换存储不改业务代码，D1/D21）；
3. **不碰 `domain/`** —— 这是 platform 层，业务包保持为空；
4. 有测试，且 S3 实现对着真桶验过往返（含签名 URL 浏览器式下载）。

## 关联

- `docs/design/11` D21（Sealos OSS）
- `CLAUDE.md` §4（DB 约定）、§7（缓存）、§8（定时任务 Redis 锁）、文档3 §4（通知在事务提交后）
