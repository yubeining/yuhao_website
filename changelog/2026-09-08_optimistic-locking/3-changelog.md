# 变更记录 —— BaseEntity 乐观锁

> 2026-09-08 ｜ 平台层 + schema（新迁移）

## 改了什么

- `persistence/BaseEntity`：加 `@Version Long version`（+ getter）。Hibernate 自动维护：
  insert 置 0、update +1、并入 `WHERE id=? AND version=?`；影响 0 行即冲突，抛
  `OptimisticLockingFailureException`。类注释写明"新建 BaseEntity 表要带 version 列"。
- 迁移 `2026-09-08_01_add-version-columns.sql`：给 ops_user / party / party_user 加
  `version bigint NOT NULL DEFAULT 0`（IF NOT EXISTS，向后兼容）。

## 为什么没有 2-implementation-plan.md

方向单一（加一列 + 一个字段），取舍已在提问时讲清（关键并发点靠 DB 护栏、这层兜普通编辑；
现在加便宜、以后补贵）。

## 验证（跑过）

- `OptimisticLockingIT`（真库）2 例：裸 SQL 在实体背后 +1 版本 → 保存过期实体抛
  `OptimisticLockingFailureException`；正常更新 version 0→1。
- 真库 validate 模式启动：迁移应用、三张表 version 列在、health UP。
- 全套 `mvn verify` 绿。

## 部署清单

- 一个新迁移，开机自动应用（三张表加列，秒级）。
- 向后兼容：回滚 jar 到旧版（不认识 version）仍能 INSERT（默认 0）/ UPDATE（不碰该列）。

## 遗留项

- 后续每张 BaseEntity 支撑的新表，建表语句直接带 version 列（不用再单独补迁移）。
- 旧的业务表（rfq / order / quote 等，尚无实体）等做到它们时随实体一起加 version。
