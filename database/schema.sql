-- database/schema.sql —— 迁移当前形态的快照，【只读参考】，不用它建库。
--
-- ★ 建库/改库只走 database/migrations/（开机自动应用）。本文件是把那些迁移应用完之后
--   pg_dump 出来的结果，方便看"现在 schema 长什么样"、code review 时对照。
-- ★ 不要手改本文件 —— 加了迁移、本地应用完之后跑 scripts/dump-schema.sh 重新生成再提交。
-- ★ 无外键（CLAUDE.md §4）；关联用裸 uuid + 显式索引。

-- PostgreSQL database dump

-- Dumped from database version 16.14 (Debian 16.14-1.pgdg13+1)
-- Dumped by pg_dump version 16.14 (Debian 16.14-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- PostgreSQL database dump complete

