# 变更记录 —— 把三条可机检的 CLAUDE.md 规则做成闸门

> 2026-09-08 ｜ 需求：把"靠记得"的规则尽量变成"挡住"（用户原话）

## 新增闸门

1. **实体时间类型必须 Instant（§4）** —— ArchUnit 规则 `useInstantNotLocalOrOffsetDateTime`：
   任何字段的类型是 LocalDateTime / OffsetDateTime 就红。跑在 `mvn test`。现有代码 6 条全过。
2. **schema.sql 同步（§5）** —— `scripts/check-schema-sync.py`：改了 `database/migrations/*.sql`
   却没同时改 `database/schema.sql` 就拒（提示跑 dump-schema.sh）。
3. **禁止硬编码 API 前缀（§1）** —— `scripts/check-hardcoded-api-prefix.py`：Java 主代码里出现
   `"/api/v1"` 字面量就拒；跳过注释（注释里写它是文档，允许）。

后两个 diff-aware、合并提交跳过，三处同步（脚本 + `.githooks/pre-commit` + CI）。

## 没做成闸门的（刻意）

§7「Redis key 走 CacheKeys」—— 检测"手写拼 key"太模糊、误报率高，硬闸门会逼人 `--no-verify`
（更糟）。留给合并前五轴 review。

## 验证

- ArchUnit：6 条通过（含新时间规则）。
- api-prefix：硬编码 → exit 1；注释里 → exit 0。
- schema-sync：只改迁移不改 schema.sql → exit 1。

## 说明

现在 pre-commit 共 7 道闸门。日常开发无感：只在 commit 时查改动行、1~2 秒、只在真违反时挡；
改前端/文档/配置的提交多数一条都不触发。
