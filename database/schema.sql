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

-- Name: customer_markup; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.customer_markup (
    id uuid NOT NULL,
    customer_org_id uuid NOT NULL,
    markup_rate numeric(8,4) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version bigint DEFAULT 0 NOT NULL,
    CONSTRAINT customer_markup_rate_positive CHECK ((markup_rate > (0)::numeric))
);

-- Name: customer_order; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.customer_order (
    id uuid NOT NULL,
    customer_org_id uuid NOT NULL,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version bigint DEFAULT 0 NOT NULL,
    status text NOT NULL,
    title text,
    wanted_lead_days integer,
    submitted_at timestamp with time zone,
    CONSTRAINT customer_order_status_chk CHECK ((status = ANY (ARRAY['DRAFT'::text, 'SUBMITTED'::text, 'QUOTED'::text, 'CONFIRMED'::text, 'READY'::text, 'CANCELLED'::text]))),
    CONSTRAINT customer_order_wanted_lead_days_positive CHECK (((wanted_lead_days IS NULL) OR (wanted_lead_days > 0)))
);

-- Name: customer_order_part; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.customer_order_part (
    id uuid NOT NULL,
    customer_order_id uuid NOT NULL,
    part_design_id uuid NOT NULL,
    part_no text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version bigint DEFAULT 0 NOT NULL,
    quantity integer NOT NULL,
    customer_org_id uuid NOT NULL,
    part_revision_id uuid NOT NULL,
    part_name text NOT NULL,
    material text,
    surface_treatment text,
    fulfillment_status text DEFAULT 'PENDING'::text NOT NULL,
    CONSTRAINT customer_order_part_fulfillment_chk CHECK ((fulfillment_status = ANY (ARRAY['PENDING'::text, 'IN_PROGRESS'::text, 'FULFILLED'::text, 'CANCELLED'::text]))),
    CONSTRAINT customer_order_part_quantity_positive CHECK ((quantity >= 1))
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
    email_verified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version bigint DEFAULT 0 NOT NULL,
    CONSTRAINT external_user_status_chk CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'DISABLED'::text])))
);

-- Name: fx_rate; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.fx_rate (
    id bigint NOT NULL,
    source text NOT NULL,
    rate_date date NOT NULL,
    base_currency text NOT NULL,
    quote_currency text NOT NULL,
    rate numeric(18,8) NOT NULL,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fx_rate_currency_code_chk CHECK (((char_length(base_currency) = 3) AND (base_currency = upper(base_currency)) AND (char_length(quote_currency) = 3) AND (quote_currency = upper(quote_currency)))),
    CONSTRAINT fx_rate_rate_positive CHECK ((rate > (0)::numeric)),
    CONSTRAINT fx_rate_source_chk CHECK ((source = 'ECB'::text))
);

-- Name: fx_rate_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.fx_rate_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: fx_rate_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.fx_rate_id_seq OWNED BY public.fx_rate.id;

-- Name: ops_order; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.ops_order (
    id uuid NOT NULL,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version bigint DEFAULT 0 NOT NULL,
    status text NOT NULL,
    dispatch_mode text,
    dispatch_round integer DEFAULT 0 NOT NULL,
    supplier_due_date date,
    dispatched_at timestamp with time zone,
    CONSTRAINT ops_order_dispatch_mode_chk CHECK (((dispatch_mode IS NULL) OR (dispatch_mode = ANY (ARRAY['TARGETED'::text, 'MARKET'::text])))),
    CONSTRAINT ops_order_dispatched_chk CHECK (((status = 'ASSEMBLING'::text) OR ((dispatch_mode IS NOT NULL) AND (supplier_due_date IS NOT NULL) AND (dispatched_at IS NOT NULL) AND (dispatch_round > 0)))),
    CONSTRAINT ops_order_status_chk CHECK ((status = ANY (ARRAY['ASSEMBLING'::text, 'OFFERED'::text, 'PUBLISHED'::text, 'ASSIGNED'::text, 'FULFILLED'::text])))
);

-- Name: ops_order_offer; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.ops_order_offer (
    id uuid NOT NULL,
    ops_order_id uuid NOT NULL,
    dispatch_round integer NOT NULL,
    supplier_org_id uuid NOT NULL,
    status text NOT NULL,
    responded_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version bigint DEFAULT 0 NOT NULL,
    CONSTRAINT ops_order_offer_status_chk CHECK ((status = ANY (ARRAY['OFFERED'::text, 'DECLINED'::text, 'REVOKED'::text])))
);

-- Name: ops_order_part; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.ops_order_part (
    id uuid NOT NULL,
    ops_order_id uuid NOT NULL,
    part_design_id uuid NOT NULL,
    part_no text NOT NULL,
    upstream_part_id uuid NOT NULL,
    source_customer_order_id uuid NOT NULL,
    source_customer_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version bigint DEFAULT 0 NOT NULL,
    quantity integer NOT NULL,
    CONSTRAINT ops_order_part_quantity_positive CHECK ((quantity >= 1))
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

-- Name: part_design; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.part_design (
    id uuid NOT NULL,
    customer_org_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version bigint DEFAULT 0 NOT NULL
);

-- Name: part_file; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.part_file (
    id uuid NOT NULL,
    part_revision_id uuid NOT NULL,
    customer_org_id uuid NOT NULL,
    storage_key text NOT NULL,
    original_filename text NOT NULL,
    declared_content_type text,
    detected_type text,
    size_bytes bigint,
    upload_status text NOT NULL,
    uploaded_by_user_id uuid NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version bigint DEFAULT 0 NOT NULL,
    CONSTRAINT part_file_upload_status_chk CHECK ((upload_status = ANY (ARRAY['PENDING'::text, 'COMPLETED'::text, 'REJECTED'::text, 'REMOVED'::text])))
);

-- Name: part_file_access_log; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.part_file_access_log (
    id bigint NOT NULL,
    part_file_id uuid NOT NULL,
    part_revision_id uuid NOT NULL,
    customer_org_id uuid NOT NULL,
    accessor_user_id uuid NOT NULL,
    accessor_party_type text NOT NULL,
    accessor_org_id uuid,
    access_type text NOT NULL,
    trace_id text,
    accessed_at timestamp with time zone DEFAULT now() NOT NULL,
    context_type text,
    context_id uuid,
    CONSTRAINT part_file_access_log_access_type_chk CHECK ((access_type = 'SIGNED_URL_ISSUED'::text)),
    CONSTRAINT part_file_access_log_context_chk CHECK ((((context_type IS NULL) AND (context_id IS NULL)) OR ((context_type = ANY (ARRAY['CUSTOMER_ORDER'::text, 'OPS_ORDER'::text, 'SUPPLIER_ORDER'::text])) AND (context_id IS NOT NULL)))),
    CONSTRAINT part_file_access_log_party_type_chk CHECK ((accessor_party_type = ANY (ARRAY['CUSTOMER'::text, 'SUPPLIER'::text, 'OPERATOR'::text])))
);

-- Name: part_file_access_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.part_file_access_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: part_file_access_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.part_file_access_log_id_seq OWNED BY public.part_file_access_log.id;

-- Name: part_revision; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.part_revision (
    id uuid NOT NULL,
    part_design_id uuid NOT NULL,
    customer_org_id uuid NOT NULL,
    rev_no integer NOT NULL,
    customer_rev text,
    created_by_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version bigint DEFAULT 0 NOT NULL,
    locked_at timestamp with time zone,
    CONSTRAINT part_revision_rev_no_positive CHECK ((rev_no >= 1))
);

-- Name: quote; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.quote (
    id uuid NOT NULL,
    customer_order_id uuid NOT NULL,
    customer_org_id uuid NOT NULL,
    version_no integer NOT NULL,
    status text NOT NULL,
    currency text NOT NULL,
    lead_days integer NOT NULL,
    markup_rate numeric(8,4) NOT NULL,
    sent_at timestamp with time zone NOT NULL,
    sent_by_user_id uuid NOT NULL,
    confirmed_at timestamp with time zone,
    confirmed_by_user_id uuid,
    rejected_at timestamp with time zone,
    rejected_by_user_id uuid,
    fx_source text,
    fx_rate_date date,
    fx_eur_cny numeric(18,8),
    fx_eur_quote numeric(18,8),
    total_amount numeric(14,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version bigint DEFAULT 0 NOT NULL,
    CONSTRAINT quote_confirmed_snapshot_chk CHECK (((status <> 'CONFIRMED'::text) OR ((confirmed_at IS NOT NULL) AND (confirmed_by_user_id IS NOT NULL) AND (fx_source IS NOT NULL) AND (fx_rate_date IS NOT NULL) AND (fx_eur_cny > (0)::numeric) AND (fx_eur_quote > (0)::numeric) AND (total_amount IS NOT NULL)))),
    CONSTRAINT quote_currency_chk CHECK ((currency = ANY (ARRAY['EUR'::text, 'USD'::text, 'GBP'::text, 'CNY'::text]))),
    CONSTRAINT quote_fx_source_chk CHECK (((fx_source IS NULL) OR (fx_source = 'ECB'::text))),
    CONSTRAINT quote_lead_days_positive CHECK ((lead_days > 0)),
    CONSTRAINT quote_markup_rate_positive CHECK ((markup_rate > (0)::numeric)),
    CONSTRAINT quote_rejected_chk CHECK (((status <> 'REJECTED'::text) OR ((rejected_at IS NOT NULL) AND (rejected_by_user_id IS NOT NULL)))),
    CONSTRAINT quote_status_chk CHECK ((status = ANY (ARRAY['SENT'::text, 'SUPERSEDED'::text, 'REJECTED'::text, 'CONFIRMED'::text]))),
    CONSTRAINT quote_version_no_positive CHECK ((version_no > 0))
);

-- Name: quote_line; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.quote_line (
    id uuid NOT NULL,
    quote_id uuid NOT NULL,
    customer_order_part_id uuid NOT NULL,
    customer_org_id uuid NOT NULL,
    line_no integer NOT NULL,
    part_code text NOT NULL,
    part_name text NOT NULL,
    quantity integer NOT NULL,
    unit_price_cny numeric(12,2) NOT NULL,
    unit_price numeric(12,2),
    line_total numeric(14,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version bigint DEFAULT 0 NOT NULL,
    CONSTRAINT quote_line_line_no_positive CHECK ((line_no > 0)),
    CONSTRAINT quote_line_quantity_positive CHECK ((quantity >= 1)),
    CONSTRAINT quote_line_unit_price_cny_positive CHECK ((unit_price_cny > (0)::numeric))
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

-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.schema_migrations (
    filename text NOT NULL,
    content_hash text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    duration_ms bigint
);

-- Name: supplier_invite; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.supplier_invite (
    id uuid NOT NULL,
    token_hash text NOT NULL,
    org_name text NOT NULL,
    email text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    used_by_org_id uuid,
    revoked_at timestamp with time zone,
    created_by_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version bigint DEFAULT 0 NOT NULL,
    CONSTRAINT supplier_invite_used_chk CHECK (((used_at IS NULL) = (used_by_org_id IS NULL)))
);

-- Name: supplier_order; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.supplier_order (
    id uuid NOT NULL,
    supplier_org_id uuid NOT NULL,
    accepted_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version bigint DEFAULT 0 NOT NULL,
    ops_order_id uuid NOT NULL,
    status text NOT NULL,
    supplier_due_date date NOT NULL,
    accepted_at timestamp with time zone NOT NULL,
    cancelled_at timestamp with time zone,
    cancel_reason text,
    contract_created_at timestamp with time zone,
    contract_created_by_user_id uuid,
    signed_at timestamp with time zone,
    signed_by_user_id uuid,
    CONSTRAINT supplier_order_cancel_chk CHECK ((((status = 'CANCELLED'::text) AND (cancelled_at IS NOT NULL) AND (cancel_reason = ANY (ARRAY['WITHDRAWN'::text, 'REVOKED'::text, 'SIGN_TIMEOUT'::text]))) OR ((status <> 'CANCELLED'::text) AND (cancelled_at IS NULL) AND (cancel_reason IS NULL)))),
    CONSTRAINT supplier_order_contract_chk CHECK ((((status <> 'CONTRACT_PENDING'::text) OR ((contract_created_at IS NOT NULL) AND (signed_at IS NULL))) AND ((status <> ALL (ARRAY['CONTRACTED'::text, 'IN_PRODUCTION'::text, 'SHIPPED'::text, 'FULFILLED'::text])) OR ((contract_created_at IS NOT NULL) AND (signed_at IS NOT NULL) AND (signed_by_user_id IS NOT NULL))))),
    CONSTRAINT supplier_order_status_chk CHECK ((status = ANY (ARRAY['ACCEPTED'::text, 'CONTRACT_PENDING'::text, 'CONTRACTED'::text, 'IN_PRODUCTION'::text, 'SHIPPED'::text, 'FULFILLED'::text, 'CANCELLED'::text])))
);

-- Name: supplier_order_part; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.supplier_order_part (
    id uuid NOT NULL,
    supplier_order_id uuid NOT NULL,
    part_design_id uuid NOT NULL,
    part_no text NOT NULL,
    upstream_part_id uuid NOT NULL,
    source_customer_order_id uuid NOT NULL,
    source_customer_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version bigint DEFAULT 0 NOT NULL,
    quantity integer NOT NULL,
    fulfillment_status text DEFAULT 'PENDING'::text NOT NULL,
    superseded_by uuid,
    replaces_part_id uuid,
    started_at timestamp with time zone,
    produced_at timestamp with time zone,
    shipped_at timestamp with time zone,
    qc_decided_at timestamp with time zone,
    CONSTRAINT supplier_order_part_quantity_positive CHECK ((quantity >= 1)),
    CONSTRAINT supplier_order_part_status_chk CHECK ((fulfillment_status = ANY (ARRAY['PENDING'::text, 'IN_PRODUCTION'::text, 'PRODUCED'::text, 'QC_PENDING'::text, 'QC_PASSED'::text, 'SUPERSEDED'::text, 'SCRAPPED'::text, 'CANCELLED'::text]))),
    CONSTRAINT supplier_order_part_superseded_chk CHECK (((fulfillment_status <> 'SUPERSEDED'::text) OR (superseded_by IS NOT NULL))),
    CONSTRAINT supplier_order_part_timeline_chk CHECK ((((fulfillment_status <> 'IN_PRODUCTION'::text) OR (started_at IS NOT NULL)) AND ((fulfillment_status <> ALL (ARRAY['PRODUCED'::text, 'QC_PENDING'::text, 'QC_PASSED'::text])) OR (produced_at IS NOT NULL)) AND ((fulfillment_status <> ALL (ARRAY['QC_PENDING'::text, 'QC_PASSED'::text])) OR (shipped_at IS NOT NULL)) AND ((fulfillment_status <> ALL (ARRAY['QC_PASSED'::text, 'SCRAPPED'::text])) OR (qc_decided_at IS NOT NULL))))
);

-- Name: supplier_price_line; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.supplier_price_line (
    id uuid NOT NULL,
    supplier_order_id uuid NOT NULL,
    supplier_order_part_id uuid NOT NULL,
    supplier_org_id uuid NOT NULL,
    customer_order_part_id uuid NOT NULL,
    quantity integer NOT NULL,
    base_unit_price_cny numeric(12,2) NOT NULL,
    discount_rate numeric(8,4) NOT NULL,
    unit_price_cny numeric(12,2) NOT NULL,
    line_total_cny numeric(14,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version bigint DEFAULT 0 NOT NULL,
    CONSTRAINT supplier_price_line_prices_positive CHECK (((base_unit_price_cny > (0)::numeric) AND (discount_rate > (0)::numeric) AND (unit_price_cny >= (0)::numeric) AND (line_total_cny >= (0)::numeric))),
    CONSTRAINT supplier_price_line_quantity_positive CHECK ((quantity >= 1))
);

-- Name: supplier_profile; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.supplier_profile (
    id uuid NOT NULL,
    supplier_org_id uuid NOT NULL,
    discount_rate numeric(8,4),
    processes text,
    materials text,
    size_range text,
    precision_grade text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version bigint DEFAULT 0 NOT NULL,
    CONSTRAINT supplier_profile_discount_positive CHECK (((discount_rate IS NULL) OR (discount_rate > (0)::numeric)))
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

-- Name: fx_rate id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.fx_rate ALTER COLUMN id SET DEFAULT nextval('public.fx_rate_id_seq'::regclass);

-- Name: part_file_access_log id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.part_file_access_log ALTER COLUMN id SET DEFAULT nextval('public.part_file_access_log_id_seq'::regclass);

-- Name: app_setting app_setting_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.app_setting
    ADD CONSTRAINT app_setting_pkey PRIMARY KEY (id);

-- Name: customer_markup customer_markup_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.customer_markup
    ADD CONSTRAINT customer_markup_pkey PRIMARY KEY (id);

-- Name: customer_order_part customer_order_part_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.customer_order_part
    ADD CONSTRAINT customer_order_part_pkey PRIMARY KEY (id);

-- Name: customer_order customer_order_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.customer_order
    ADD CONSTRAINT customer_order_pkey PRIMARY KEY (id);

-- Name: dict dict_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.dict
    ADD CONSTRAINT dict_pkey PRIMARY KEY (id);

-- Name: external_user external_user_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.external_user
    ADD CONSTRAINT external_user_pkey PRIMARY KEY (id);

-- Name: fx_rate fx_rate_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.fx_rate
    ADD CONSTRAINT fx_rate_pkey PRIMARY KEY (id);

-- Name: ops_order_offer ops_order_offer_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ops_order_offer
    ADD CONSTRAINT ops_order_offer_pkey PRIMARY KEY (id);

-- Name: ops_order_part ops_order_part_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ops_order_part
    ADD CONSTRAINT ops_order_part_pkey PRIMARY KEY (id);

-- Name: ops_order ops_order_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ops_order
    ADD CONSTRAINT ops_order_pkey PRIMARY KEY (id);

-- Name: ops_user ops_user_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ops_user
    ADD CONSTRAINT ops_user_pkey PRIMARY KEY (id);

-- Name: organization organization_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.organization
    ADD CONSTRAINT organization_pkey PRIMARY KEY (id);

-- Name: part_design part_design_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.part_design
    ADD CONSTRAINT part_design_pkey PRIMARY KEY (id);

-- Name: part_file_access_log part_file_access_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.part_file_access_log
    ADD CONSTRAINT part_file_access_log_pkey PRIMARY KEY (id);

-- Name: part_file part_file_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.part_file
    ADD CONSTRAINT part_file_pkey PRIMARY KEY (id);

-- Name: part_revision part_revision_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.part_revision
    ADD CONSTRAINT part_revision_pkey PRIMARY KEY (id);

-- Name: quote_line quote_line_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.quote_line
    ADD CONSTRAINT quote_line_pkey PRIMARY KEY (id);

-- Name: quote quote_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.quote
    ADD CONSTRAINT quote_pkey PRIMARY KEY (id);

-- Name: role role_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.role
    ADD CONSTRAINT role_pkey PRIMARY KEY (id);

-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (filename);

-- Name: supplier_invite supplier_invite_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.supplier_invite
    ADD CONSTRAINT supplier_invite_pkey PRIMARY KEY (id);

-- Name: supplier_order_part supplier_order_part_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.supplier_order_part
    ADD CONSTRAINT supplier_order_part_pkey PRIMARY KEY (id);

-- Name: supplier_order supplier_order_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.supplier_order
    ADD CONSTRAINT supplier_order_pkey PRIMARY KEY (id);

-- Name: supplier_price_line supplier_price_line_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.supplier_price_line
    ADD CONSTRAINT supplier_price_line_pkey PRIMARY KEY (id);

-- Name: supplier_profile supplier_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.supplier_profile
    ADD CONSTRAINT supplier_profile_pkey PRIMARY KEY (id);

-- Name: user_role user_role_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_role
    ADD CONSTRAINT user_role_pkey PRIMARY KEY (id);

-- Name: app_setting_key_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX app_setting_key_uk ON public.app_setting USING btree (config_key);

-- Name: customer_markup_customer_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX customer_markup_customer_uk ON public.customer_markup USING btree (customer_org_id);

-- Name: customer_order_org_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX customer_order_org_idx ON public.customer_order USING btree (customer_org_id);

-- Name: customer_order_part_customer_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX customer_order_part_customer_idx ON public.customer_order_part USING btree (customer_org_id);

-- Name: customer_order_part_design_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX customer_order_part_design_idx ON public.customer_order_part USING btree (part_design_id);

-- Name: customer_order_part_no_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX customer_order_part_no_uk ON public.customer_order_part USING btree (part_no);

-- Name: customer_order_part_order_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX customer_order_part_order_idx ON public.customer_order_part USING btree (customer_order_id);

-- Name: customer_order_part_revision_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX customer_order_part_revision_idx ON public.customer_order_part USING btree (part_revision_id);

-- Name: customer_order_status_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX customer_order_status_idx ON public.customer_order USING btree (status);

-- Name: dict_type_code_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX dict_type_code_uk ON public.dict USING btree (type, code);

-- Name: external_user_email_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX external_user_email_uk ON public.external_user USING btree (email);

-- Name: external_user_org_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX external_user_org_idx ON public.external_user USING btree (org_id);

-- Name: fx_rate_source_date_pair_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX fx_rate_source_date_pair_uk ON public.fx_rate USING btree (source, rate_date, base_currency, quote_currency);

-- Name: ops_order_offer_round_supplier_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX ops_order_offer_round_supplier_uk ON public.ops_order_offer USING btree (ops_order_id, dispatch_round, supplier_org_id);

-- Name: ops_order_offer_supplier_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX ops_order_offer_supplier_idx ON public.ops_order_offer USING btree (supplier_org_id, status);

-- Name: ops_order_part_design_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX ops_order_part_design_idx ON public.ops_order_part USING btree (part_design_id);

-- Name: ops_order_part_no_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX ops_order_part_no_uk ON public.ops_order_part USING btree (part_no);

-- Name: ops_order_part_order_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX ops_order_part_order_idx ON public.ops_order_part USING btree (ops_order_id);

-- Name: ops_order_part_source_customer_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX ops_order_part_source_customer_idx ON public.ops_order_part USING btree (source_customer_id);

-- Name: ops_order_part_source_customer_order_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX ops_order_part_source_customer_order_idx ON public.ops_order_part USING btree (source_customer_order_id);

-- Name: ops_order_part_upstream_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX ops_order_part_upstream_idx ON public.ops_order_part USING btree (upstream_part_id);

-- Name: ops_order_status_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX ops_order_status_idx ON public.ops_order USING btree (status);

-- Name: ops_user_email_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX ops_user_email_uk ON public.ops_user USING btree (email);

-- Name: ops_user_org_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX ops_user_org_idx ON public.ops_user USING btree (org_id);

-- Name: organization_type_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX organization_type_idx ON public.organization USING btree (type);

-- Name: part_design_customer_code_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX part_design_customer_code_uk ON public.part_design USING btree (customer_org_id, code);

-- Name: part_design_customer_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX part_design_customer_idx ON public.part_design USING btree (customer_org_id);

-- Name: part_file_access_log_customer_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX part_file_access_log_customer_idx ON public.part_file_access_log USING btree (customer_org_id);

-- Name: part_file_access_log_file_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX part_file_access_log_file_idx ON public.part_file_access_log USING btree (part_file_id);

-- Name: part_file_access_log_revision_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX part_file_access_log_revision_idx ON public.part_file_access_log USING btree (part_revision_id, accessed_at DESC);

-- Name: part_file_customer_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX part_file_customer_idx ON public.part_file USING btree (customer_org_id);

-- Name: part_file_revision_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX part_file_revision_idx ON public.part_file USING btree (part_revision_id);

-- Name: part_file_storage_key_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX part_file_storage_key_uk ON public.part_file USING btree (storage_key);

-- Name: part_revision_customer_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX part_revision_customer_idx ON public.part_revision USING btree (customer_org_id);

-- Name: part_revision_design_rev_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX part_revision_design_rev_uk ON public.part_revision USING btree (part_design_id, rev_no);

-- Name: quote_customer_status_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX quote_customer_status_idx ON public.quote USING btree (customer_org_id, status);

-- Name: quote_line_customer_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX quote_line_customer_idx ON public.quote_line USING btree (customer_org_id);

-- Name: quote_line_order_part_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX quote_line_order_part_idx ON public.quote_line USING btree (customer_order_part_id);

-- Name: quote_line_quote_line_no_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX quote_line_quote_line_no_uk ON public.quote_line USING btree (quote_id, line_no);

-- Name: quote_line_quote_part_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX quote_line_quote_part_uk ON public.quote_line USING btree (quote_id, customer_order_part_id);

-- Name: quote_order_one_confirmed_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX quote_order_one_confirmed_uk ON public.quote USING btree (customer_order_id) WHERE (status = 'CONFIRMED'::text);

-- Name: quote_order_one_sent_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX quote_order_one_sent_uk ON public.quote USING btree (customer_order_id) WHERE (status = 'SENT'::text);

-- Name: quote_order_version_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX quote_order_version_uk ON public.quote USING btree (customer_order_id, version_no);

-- Name: role_scope_code_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX role_scope_code_uk ON public.role USING btree (scope, code);

-- Name: supplier_invite_email_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX supplier_invite_email_idx ON public.supplier_invite USING btree (email);

-- Name: supplier_invite_token_hash_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX supplier_invite_token_hash_uk ON public.supplier_invite USING btree (token_hash);

-- Name: supplier_invite_used_by_org_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX supplier_invite_used_by_org_idx ON public.supplier_invite USING btree (used_by_org_id);

-- Name: supplier_order_one_active_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX supplier_order_one_active_uk ON public.supplier_order USING btree (ops_order_id) WHERE (status <> 'CANCELLED'::text);

-- Name: supplier_order_ops_order_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX supplier_order_ops_order_idx ON public.supplier_order USING btree (ops_order_id);

-- Name: supplier_order_org_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX supplier_order_org_idx ON public.supplier_order USING btree (supplier_org_id);

-- Name: supplier_order_part_design_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX supplier_order_part_design_idx ON public.supplier_order_part USING btree (part_design_id);

-- Name: supplier_order_part_no_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX supplier_order_part_no_uk ON public.supplier_order_part USING btree (part_no);

-- Name: supplier_order_part_order_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX supplier_order_part_order_idx ON public.supplier_order_part USING btree (supplier_order_id);

-- Name: supplier_order_part_order_status_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX supplier_order_part_order_status_idx ON public.supplier_order_part USING btree (supplier_order_id, fulfillment_status);

-- Name: supplier_order_part_replaces_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX supplier_order_part_replaces_idx ON public.supplier_order_part USING btree (replaces_part_id);

-- Name: supplier_order_part_source_customer_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX supplier_order_part_source_customer_idx ON public.supplier_order_part USING btree (source_customer_id);

-- Name: supplier_order_part_source_customer_order_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX supplier_order_part_source_customer_order_idx ON public.supplier_order_part USING btree (source_customer_order_id);

-- Name: supplier_order_part_superseded_by_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX supplier_order_part_superseded_by_idx ON public.supplier_order_part USING btree (superseded_by);

-- Name: supplier_order_part_upstream_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX supplier_order_part_upstream_idx ON public.supplier_order_part USING btree (upstream_part_id);

-- Name: supplier_order_status_accepted_at_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX supplier_order_status_accepted_at_idx ON public.supplier_order USING btree (status, accepted_at);

-- Name: supplier_price_line_customer_part_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX supplier_price_line_customer_part_idx ON public.supplier_price_line USING btree (customer_order_part_id);

-- Name: supplier_price_line_order_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX supplier_price_line_order_idx ON public.supplier_price_line USING btree (supplier_order_id);

-- Name: supplier_price_line_part_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX supplier_price_line_part_uk ON public.supplier_price_line USING btree (supplier_order_part_id);

-- Name: supplier_price_line_supplier_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX supplier_price_line_supplier_idx ON public.supplier_price_line USING btree (supplier_org_id);

-- Name: supplier_profile_org_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX supplier_profile_org_uk ON public.supplier_profile USING btree (supplier_org_id);

-- Name: user_role_role_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX user_role_role_idx ON public.user_role USING btree (role_id);

-- Name: user_role_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX user_role_uk ON public.user_role USING btree (user_id, role_id);

-- PostgreSQL database dump complete

