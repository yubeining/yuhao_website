# 变更记录 —— 补齐 CLAUDE.md 合规

> 2026-09-08 ｜ 平台层 + 参考文件

## 1. 审计时间类型 → Instant（§4）
- `AuditEvent.createdAt`、构造/getter、`AuditService.record` 从 OffsetDateTime 改 Instant（列仍 timestamptz）。
  与 BaseEntity 一致；OffsetDateTime 不是 LocalDateTime 那个坑，但规则明写 Instant。

## 2. Redis key 走 CacheKeys（§7）
- `CacheKeys` 新增 `refreshToken(token)`、`idempotency(target, arg)`。
- `RefreshTokenService`、`IdempotencyAspect` 去掉手写 PREFIX 拼接，改用 CacheKeys。
  key 字符串不变（都是 colon 拼接），Redis 里的实际 key 一致，无需迁移。

## 3. database/schema.sql（§5）
- 新增 `database/schema.sql`：从真库（应用完全部迁移）pg_dump 出的**只读快照**，32 表、0 外键、含触发器。
- 新增 `scripts/dump-schema.sh`：重生成脚本 —— 加迁移、本地应用完后跑它重出，不手维护（防漂移）。
- 建库/改库仍只走迁移；schema.sql 只供对照。

## 验证
- `mvn verify` 全绿（含 RefreshTokenServiceIT / IdempotencyAspectIT，key 换 CacheKeys 后行为不变）。
- schema.sql：`CREATE TABLE` 32、`FOREIGN KEY/REFERENCES` 0。

## 部署清单
- 无迁移、无配置。纯代码 + 参考文件。
