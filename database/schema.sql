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

SET default_tablespace = '';

SET default_table_access_method = heap;

-- Name: app_setting; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.app_setting (
    id uuid NOT NULL,
    config_key text NOT NULL,
    config_value jsonb NOT NULL,
    value_type text DEFAULT 'STRING'::text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version bigint DEFAULT 0 NOT NULL,
    CONSTRAINT app_setting_value_type_chk CHECK ((value_type = ANY (ARRAY['STRING'::text, 'NUMBER'::text, 'BOOL'::text, 'JSON'::text])))
);

-- Name: dict; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.dict (
    id uuid NOT NULL,
    type text NOT NULL,
    code text NOT NULL,
    names jsonb DEFAULT '{}'::jsonb NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version bigint DEFAULT 0 NOT NULL,
    CONSTRAINT dict_status_chk CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'DISABLED'::text])))
);

-- Name: external_user; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.external_user (
    id uuid NOT NULL,
    org_id uuid NOT NULL,
    email text NOT NULL,
    password_hash text,
    display_name text NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    locale text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version bigint DEFAULT 0 NOT NULL,
    CONSTRAINT external_user_status_chk CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'DISABLED'::text])))
);

-- Name: ops_user; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.ops_user (
    id uuid NOT NULL,
    org_id uuid NOT NULL,
    email text NOT NULL,
    password_hash text,
    display_name text NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    locale text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version bigint DEFAULT 0 NOT NULL,
    CONSTRAINT ops_user_status_chk CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'DISABLED'::text])))
);

-- Name: organization; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.organization (
    id uuid NOT NULL,
    type text NOT NULL,
    name text NOT NULL,
    country text,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version bigint DEFAULT 0 NOT NULL,
    CONSTRAINT organization_status_chk CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'DISABLED'::text]))),
    CONSTRAINT organization_type_chk CHECK ((type = ANY (ARRAY['INTERNAL'::text, 'CUSTOMER'::text, 'SUPPLIER'::text])))
);

-- Name: role; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.role (
    id uuid NOT NULL,
    scope text NOT NULL,
    code text NOT NULL,
    name_i18n_key text NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version bigint DEFAULT 0 NOT NULL,
    CONSTRAINT role_scope_chk CHECK ((scope = ANY (ARRAY['INTERNAL'::text, 'EXTERNAL'::text]))),
    CONSTRAINT role_status_chk CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'DISABLED'::text])))
);

-- Name: user_role; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.user_role (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    role_id uuid NOT NULL,
    granted_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version bigint DEFAULT 0 NOT NULL
);

-- Name: app_setting app_setting_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.app_setting
    ADD CONSTRAINT app_setting_pkey PRIMARY KEY (id);

-- Name: dict dict_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.dict
    ADD CONSTRAINT dict_pkey PRIMARY KEY (id);

-- Name: external_user external_user_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.external_user
    ADD CONSTRAINT external_user_pkey PRIMARY KEY (id);

-- Name: ops_user ops_user_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ops_user
    ADD CONSTRAINT ops_user_pkey PRIMARY KEY (id);

-- Name: organization organization_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.organization
    ADD CONSTRAINT organization_pkey PRIMARY KEY (id);

-- Name: role role_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.role
    ADD CONSTRAINT role_pkey PRIMARY KEY (id);

-- Name: user_role user_role_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_role
    ADD CONSTRAINT user_role_pkey PRIMARY KEY (id);

-- Name: app_setting_key_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX app_setting_key_uk ON public.app_setting USING btree (config_key);

-- Name: dict_type_code_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX dict_type_code_uk ON public.dict USING btree (type, code);

-- Name: external_user_email_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX external_user_email_uk ON public.external_user USING btree (email);

-- Name: external_user_org_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX external_user_org_idx ON public.external_user USING btree (org_id);

-- Name: ops_user_email_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX ops_user_email_uk ON public.ops_user USING btree (email);

-- Name: ops_user_org_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX ops_user_org_idx ON public.ops_user USING btree (org_id);

-- Name: organization_type_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX organization_type_idx ON public.organization USING btree (type);

-- Name: role_scope_code_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX role_scope_code_uk ON public.role USING btree (scope, code);

-- Name: user_role_role_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX user_role_role_idx ON public.user_role USING btree (role_id);

-- Name: user_role_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX user_role_uk ON public.user_role USING btree (user_id, role_id);

-- PostgreSQL database dump complete

