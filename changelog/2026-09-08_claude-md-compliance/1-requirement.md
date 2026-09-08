# 需求 —— 补齐其余不符合 CLAUDE.md 的地方

> 提出日期：2026-09-08 ｜ 提出人：项目负责人

## 原话

> 「检查一下还有没有其他没遵守 claude.md 的地方」

## 背景

清完外键后逐条对 CLAUDE.md 的可机检规则做审计，查到 3 处不符（其余抽查合规）。

## 验收（3 处）

1. §4「实体字段用 Instant」：`AuditEvent` / `AuditService` 用的是 OffsetDateTime → 改 Instant。
2. §7「Redis key 走集中的 key 常量类」：`RefreshTokenService`、`IdempotencyAspect` 手写拼 key → 走 CacheKeys。
3. §5「改动同步反映到 database/schema.sql」：该文件从不存在 → 生成 + 配重生成脚本。

## 关联

- `CLAUDE.md` §4 / §5 / §7
