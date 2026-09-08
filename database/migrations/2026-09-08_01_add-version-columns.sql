-- 给已有的、由 BaseEntity 支撑的表补乐观锁版本列。
--
-- 依据：2026-09-08 决策 —— BaseEntity 加 @Version（防并发"读-改-写"丢更新）。
-- ddl-auto=validate 要求每个映射了 @Version 的实体，其表必须有 version 列，
-- 否则启动校验失败。当前继承 BaseEntity 的实体只有 ops_user / party / party_user 三张。
--
-- ★ 向后兼容：加"带默认值的 NOT NULL 列"是安全变更 —— 旧版本代码（不认识 version）
--   照样能 INSERT（默认 0 兜底）和 UPDATE（不碰这列）。DB 默认 0 也保证非 Hibernate 的
--   插入（如 DevAccountSeeder 的 JdbcTemplate）合法。
-- ★ 以后每新建一张 BaseEntity 支撑的表，建表语句里就带上 version 列，不用再单独补。

ALTER TABLE ops_user   ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 0;
ALTER TABLE party      ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 0;
ALTER TABLE party_user ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 0;
