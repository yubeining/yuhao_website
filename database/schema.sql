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

-- Name: check_production_allocation(); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.check_production_allocation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF (SELECT COALESCE(SUM(poi.qty), 0)
          FROM production_order_item poi
         WHERE poi.order_line_id = NEW.order_line_id)
       > (SELECT ol.qty FROM order_line ol WHERE ol.id = NEW.order_line_id)
    THEN
        RAISE EXCEPTION 'ALLOCATION_EXCEEDS_ORDER_LINE_QTY: order_line_id=%', NEW.order_line_id;
    END IF;
    RETURN NEW;
END;
$$;

SET default_tablespace = '';

SET default_table_access_method = heap;

-- Name: access_grant; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.access_grant (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    resource_key text NOT NULL,
    action text NOT NULL,
    granted_by_user_id uuid,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT access_grant_action_chk CHECK ((action = ANY (ARRAY['READ'::text, 'WRITE'::text])))
);

-- Name: audit_event; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.audit_event (
    id bigint NOT NULL,
    action text NOT NULL,
    target_type text NOT NULL,
    target_id text,
    actor_user_id uuid,
    actor_party_id uuid,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    ip_hash text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: audit_event_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.audit_event_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: audit_event_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.audit_event_id_seq OWNED BY public.audit_event.id;

-- Name: customer_quote; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.customer_quote (
    id uuid NOT NULL,
    quote_no text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    rfq_id uuid NOT NULL,
    customer_party_id uuid NOT NULL,
    currency text DEFAULT 'EUR'::text NOT NULL,
    incoterm text NOT NULL,
    total_amount numeric(14,2) DEFAULT 0 NOT NULL,
    total_cost_cny numeric(14,2),
    gross_margin_pct numeric(6,4),
    valid_until timestamp with time zone NOT NULL,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    withdraw_reason text,
    reject_reason text,
    lock_version integer DEFAULT 0 NOT NULL,
    prepared_by_user_id uuid,
    sent_at timestamp with time zone,
    responded_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT customer_quote_status_chk CHECK ((status = ANY (ARRAY['DRAFT'::text, 'PENDING_APPROVAL'::text, 'APPROVED'::text, 'SENT'::text, 'ACCEPTED'::text, 'REJECTED'::text, 'EXPIRED'::text, 'WITHDRAWN'::text, 'INTERNAL_REJECTED'::text])))
);

-- Name: customer_quote_line; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.customer_quote_line (
    id uuid NOT NULL,
    customer_quote_id uuid NOT NULL,
    line_no integer NOT NULL,
    rfq_item_id uuid NOT NULL,
    part_revision_id uuid NOT NULL,
    qty integer NOT NULL,
    unit_price numeric(14,4) NOT NULL,
    total_price numeric(14,2) NOT NULL,
    lead_time_days integer,
    pricing_rule_versions jsonb DEFAULT '{}'::jsonb NOT NULL,
    fx_rate numeric(12,6),
    fx_buffer_pct numeric(6,4),
    fx_snapshot_at timestamp with time zone,
    cost_breakdown jsonb DEFAULT '{}'::jsonb NOT NULL,
    supplier_quote_line_id uuid,
    selection_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT customer_quote_line_qty_chk CHECK ((qty > 0))
);

-- Name: file_access_log; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.file_access_log (
    id bigint NOT NULL,
    file_object_id uuid NOT NULL,
    part_revision_id uuid,
    accessor_user_id uuid NOT NULL,
    accessor_party_id uuid NOT NULL,
    access_type text NOT NULL,
    context text,
    ip_address inet,
    user_agent text,
    accessed_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: file_access_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.file_access_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: file_access_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.file_access_log_id_seq OWNED BY public.file_access_log.id;

-- Name: file_object; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.file_object (
    id uuid NOT NULL,
    owner_party_id uuid,
    storage_uri text NOT NULL,
    original_filename text NOT NULL,
    mime_type text NOT NULL,
    size_bytes bigint NOT NULL,
    checksum_sha256 text,
    purpose text NOT NULL,
    upload_status text DEFAULT 'PENDING'::text NOT NULL,
    scan_status text DEFAULT 'PENDING'::text NOT NULL,
    uploaded_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT file_object_scan_status_chk CHECK ((scan_status = ANY (ARRAY['PENDING'::text, 'CLEAN'::text, 'INFECTED'::text, 'SKIPPED'::text]))),
    CONSTRAINT file_object_upload_status_chk CHECK ((upload_status = ANY (ARRAY['PENDING'::text, 'COMPLETED'::text, 'FAILED'::text, 'EXPIRED'::text])))
);

-- Name: fx_rate_snapshot; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.fx_rate_snapshot (
    id uuid NOT NULL,
    base_currency text NOT NULL,
    quote_currency text NOT NULL,
    rate numeric(12,6) NOT NULL,
    source text NOT NULL,
    fetched_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: lead; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.lead (
    id uuid NOT NULL,
    company_name text,
    contact_name text,
    email text NOT NULL,
    phone text,
    country text,
    message text,
    source text,
    utm jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'NEW'::text NOT NULL,
    converted_party_id uuid,
    ip_hash text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: ops_user; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.ops_user (
    id uuid NOT NULL,
    email text,
    wework_id text,
    display_name text NOT NULL,
    password_hash text,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version bigint DEFAULT 0 NOT NULL,
    CONSTRAINT ops_user_identity_chk CHECK (((email IS NOT NULL) OR (wework_id IS NOT NULL))),
    CONSTRAINT ops_user_status_chk CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'DISABLED'::text])))
);

-- Name: order_line; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.order_line (
    id uuid NOT NULL,
    order_id uuid NOT NULL,
    line_no integer NOT NULL,
    part_revision_id uuid NOT NULL,
    quote_line_id uuid,
    qty integer NOT NULL,
    unit_price numeric(14,4) NOT NULL,
    total_price numeric(14,2) NOT NULL,
    promised_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_line_qty_chk CHECK ((qty > 0))
);

-- Name: production_order_item; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.production_order_item (
    id uuid NOT NULL,
    production_order_id uuid NOT NULL,
    order_line_id uuid NOT NULL,
    part_revision_id uuid NOT NULL,
    qty integer NOT NULL,
    unit_cost numeric(14,4) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT production_order_item_qty_chk CHECK ((qty > 0))
);

-- Name: order_line_allocation; Type: VIEW; Schema: public; Owner: -

CREATE VIEW public.order_line_allocation AS
 SELECT ol.id AS order_line_id,
    ol.order_id,
    ol.qty AS ordered_qty,
    COALESCE(sum(poi.qty), (0)::bigint) AS allocated_qty,
    (ol.qty - COALESCE(sum(poi.qty), (0)::bigint)) AS unallocated_qty
   FROM (public.order_line ol
     LEFT JOIN public.production_order_item poi ON ((poi.order_line_id = ol.id)))
  GROUP BY ol.id, ol.order_id, ol.qty;

-- Name: part; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.part (
    id uuid NOT NULL,
    customer_party_id uuid NOT NULL,
    customer_part_no text,
    name text NOT NULL,
    category text,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    customer_system_no text,
    customer_topic_no text
);

-- Name: part_file; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.part_file (
    id uuid NOT NULL,
    part_revision_id uuid NOT NULL,
    file_object_id uuid NOT NULL,
    kind text NOT NULL,
    watermark_party_id uuid,
    watermark_batch text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT part_file_kind_chk CHECK ((kind = ANY (ARRAY['ORIGINAL'::text, 'SANITIZED'::text, 'PREVIEW'::text, 'WATERMARKED'::text]))),
    CONSTRAINT part_file_watermark_chk CHECK (((kind = 'WATERMARKED'::text) = (watermark_party_id IS NOT NULL)))
);

-- Name: part_revision; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.part_revision (
    id uuid NOT NULL,
    part_id uuid NOT NULL,
    rev_code text NOT NULL,
    material text,
    qty_hint integer,
    tolerance_grade text,
    surface_treatment text,
    heat_treatment text,
    spec_template_id uuid,
    spec jsonb DEFAULT '{}'::jsonb NOT NULL,
    export_control_flag boolean DEFAULT false NOT NULL,
    export_control_note text,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    has_sanitized_file boolean DEFAULT false NOT NULL,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT part_revision_status_chk CHECK ((status = ANY (ARRAY['DRAFT'::text, 'READY'::text, 'SUPERSEDED'::text])))
);

-- Name: party; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.party (
    id uuid NOT NULL,
    type text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    legal_name text,
    country text,
    vat_number text,
    default_currency text DEFAULT 'EUR'::text NOT NULL,
    default_incoterm text,
    status text DEFAULT 'PENDING'::text NOT NULL,
    kyc_status text DEFAULT 'NOT_STARTED'::text NOT NULL,
    kyc_approved_at timestamp with time zone,
    terms_signed_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version bigint DEFAULT 0 NOT NULL,
    CONSTRAINT party_status_chk CHECK ((status = ANY (ARRAY['PENDING'::text, 'ACTIVE'::text, 'SUSPENDED'::text]))),
    CONSTRAINT party_type_chk CHECK ((type = ANY (ARRAY['CUSTOMER'::text, 'SUPPLIER'::text])))
);

-- Name: party_user; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.party_user (
    id uuid NOT NULL,
    party_id uuid NOT NULL,
    email text,
    phone text,
    display_name text NOT NULL,
    role text DEFAULT 'MEMBER'::text NOT NULL,
    locale text DEFAULT 'en'::text NOT NULL,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    password_hash text,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version bigint DEFAULT 0 NOT NULL,
    CONSTRAINT party_user_identity_chk CHECK (((email IS NOT NULL) OR (phone IS NOT NULL))),
    CONSTRAINT party_user_status_chk CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'DISABLED'::text])))
);

-- Name: pricing_rule; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.pricing_rule (
    id uuid NOT NULL,
    code text NOT NULL,
    version integer NOT NULL,
    kind text NOT NULL,
    applies_to_incoterms text[] DEFAULT '{EXW,FOB,CIF,DAP,DDP}'::text[] NOT NULL,
    formula jsonb NOT NULL,
    effective_from timestamp with time zone DEFAULT now() NOT NULL,
    effective_to timestamp with time zone,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pricing_rule_status_chk CHECK ((status = ANY (ARRAY['DRAFT'::text, 'ACTIVE'::text, 'RETIRED'::text])))
);

-- Name: production_milestone; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.production_milestone (
    id uuid NOT NULL,
    production_order_id uuid NOT NULL,
    code text NOT NULL,
    planned_date date,
    actual_date date,
    status text DEFAULT 'PENDING'::text NOT NULL,
    note text,
    reported_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: production_order; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.production_order (
    id uuid NOT NULL,
    production_no text NOT NULL,
    order_id uuid NOT NULL,
    supplier_party_id uuid NOT NULL,
    currency text DEFAULT 'CNY'::text NOT NULL,
    total_cost numeric(14,2) DEFAULT 0 NOT NULL,
    due_date date,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    reject_reason text,
    issued_by_user_id uuid,
    issued_at timestamp with time zone,
    accepted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT production_order_status_chk CHECK ((status = ANY (ARRAY['DRAFT'::text, 'ISSUED'::text, 'ACCEPTED'::text, 'REJECTED'::text, 'IN_PROGRESS'::text, 'SUBMITTED_FOR_QC'::text, 'REWORK'::text, 'DONE'::text, 'CANCELLED'::text])))
);

-- Name: quote_approval; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.quote_approval (
    id uuid NOT NULL,
    customer_quote_id uuid NOT NULL,
    step_no integer NOT NULL,
    approver_user_id uuid NOT NULL,
    decision text DEFAULT 'PENDING'::text NOT NULL,
    comment text,
    snapshot_total numeric(14,2),
    snapshot_margin_pct numeric(6,4),
    decided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT quote_approval_decision_chk CHECK ((decision = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'REJECTED'::text])))
);

-- Name: rfq; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.rfq (
    id uuid NOT NULL,
    rfq_no text NOT NULL,
    customer_party_id uuid NOT NULL,
    submitted_by_user_id uuid,
    title text,
    target_price_eur numeric(14,2),
    end_use text,
    delivery_country text,
    delivery_address text,
    required_by date,
    incoterm text,
    currency text DEFAULT 'EUR'::text NOT NULL,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    decline_reason text,
    owner_user_id uuid,
    submitted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rfq_status_chk CHECK ((status = ANY (ARRAY['DRAFT'::text, 'SUBMITTED'::text, 'UNDER_REVIEW'::text, 'NEED_INFO'::text, 'SOURCING'::text, 'QUOTED'::text, 'WON'::text, 'LOST'::text, 'EXPIRED'::text, 'DECLINED'::text])))
);

-- Name: rfq_attachment; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.rfq_attachment (
    id uuid NOT NULL,
    rfq_id uuid NOT NULL,
    file_object_id uuid NOT NULL,
    kind text NOT NULL,
    shareable_to_supplier boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: rfq_item; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.rfq_item (
    id uuid NOT NULL,
    rfq_id uuid NOT NULL,
    line_no integer NOT NULL,
    part_revision_id uuid NOT NULL,
    qty integer NOT NULL,
    qty_tiers integer[] DEFAULT '{}'::integer[] NOT NULL,
    remark text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    customer_task_no text,
    CONSTRAINT rfq_item_qty_chk CHECK ((qty > 0))
);

-- Name: sales_order; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.sales_order (
    id uuid NOT NULL,
    order_no text NOT NULL,
    customer_party_id uuid NOT NULL,
    rfq_id uuid NOT NULL,
    customer_quote_id uuid NOT NULL,
    currency text DEFAULT 'EUR'::text NOT NULL,
    incoterm text NOT NULL,
    total_amount numeric(14,2) NOT NULL,
    delivery_country text,
    delivery_address text,
    promised_delivery_date date,
    status text DEFAULT 'CONFIRMED'::text NOT NULL,
    cancel_reason text,
    payment_status text DEFAULT 'UNPAID'::text NOT NULL,
    confirmed_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sales_order_payment_chk CHECK ((payment_status = ANY (ARRAY['UNPAID'::text, 'INVOICED'::text, 'PARTIAL'::text, 'PAID'::text]))),
    CONSTRAINT sales_order_status_chk CHECK ((status = ANY (ARRAY['CONFIRMED'::text, 'IN_PRODUCTION'::text, 'QC'::text, 'PACKED'::text, 'SHIPPED'::text, 'DELIVERED'::text, 'CLOSED'::text, 'CANCELLED'::text])))
);

-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.schema_migrations (
    filename text NOT NULL,
    content_hash text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    duration_ms bigint
);

-- Name: sourcing_item; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.sourcing_item (
    id uuid NOT NULL,
    sourcing_package_id uuid NOT NULL,
    line_no integer NOT NULL,
    rfq_item_id uuid NOT NULL,
    part_revision_id uuid NOT NULL,
    qty integer NOT NULL,
    qty_tiers integer[] DEFAULT '{}'::integer[] NOT NULL,
    material text,
    tolerance_grade text,
    surface_treatment text,
    heat_treatment text,
    spec_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    remark text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: sourcing_package; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.sourcing_package (
    id uuid NOT NULL,
    package_no text NOT NULL,
    rfq_id uuid NOT NULL,
    title text,
    delivery_window_from date,
    delivery_window_to date,
    remark text,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    dispatched_by_user_id uuid,
    dispatched_at timestamp with time zone,
    quote_due_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sourcing_package_status_chk CHECK ((status = ANY (ARRAY['DRAFT'::text, 'DISPATCHED'::text, 'CLOSED'::text, 'CANCELLED'::text])))
);

-- Name: spec_template; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.spec_template (
    id uuid NOT NULL,
    category text NOT NULL,
    name text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    schema jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: supplier_capability; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.supplier_capability (
    id uuid NOT NULL,
    supplier_party_id uuid NOT NULL,
    category text NOT NULL,
    materials text[] DEFAULT '{}'::text[] NOT NULL,
    max_dimension_mm numeric(10,2),
    min_tolerance_mm numeric(10,4),
    monthly_capacity integer,
    equipment_note text,
    certifications text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: supplier_invitation; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.supplier_invitation (
    id uuid NOT NULL,
    sourcing_package_id uuid NOT NULL,
    supplier_party_id uuid NOT NULL,
    status text DEFAULT 'INVITED'::text NOT NULL,
    decline_reason text,
    watermark_batch text NOT NULL,
    invited_at timestamp with time zone DEFAULT now() NOT NULL,
    first_viewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT supplier_invitation_status_chk CHECK ((status = ANY (ARRAY['INVITED'::text, 'VIEWED'::text, 'QUOTED'::text, 'DECLINED'::text, 'EXPIRED'::text])))
);

-- Name: supplier_quote; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.supplier_quote (
    id uuid NOT NULL,
    invitation_id uuid NOT NULL,
    supplier_party_id uuid NOT NULL,
    sourcing_package_id uuid NOT NULL,
    currency text DEFAULT 'CNY'::text NOT NULL,
    valid_until timestamp with time zone NOT NULL,
    lead_time_days integer,
    tooling_fee_cny numeric(14,2) DEFAULT 0 NOT NULL,
    remark text,
    status text DEFAULT 'SUBMITTED'::text NOT NULL,
    submitted_by_user_id uuid,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT supplier_quote_status_chk CHECK ((status = ANY (ARRAY['SUBMITTED'::text, 'SELECTED'::text, 'NOT_SELECTED'::text, 'EXPIRED'::text])))
);

-- Name: supplier_quote_line; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.supplier_quote_line (
    id uuid NOT NULL,
    supplier_quote_id uuid NOT NULL,
    sourcing_item_id uuid NOT NULL,
    qty integer NOT NULL,
    unit_price_cny numeric(14,4) NOT NULL,
    lead_time_days integer,
    moq integer,
    remark text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT supplier_quote_line_price_chk CHECK ((unit_price_cny >= (0)::numeric))
);

-- Name: audit_event id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.audit_event ALTER COLUMN id SET DEFAULT nextval('public.audit_event_id_seq'::regclass);

-- Name: file_access_log id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.file_access_log ALTER COLUMN id SET DEFAULT nextval('public.file_access_log_id_seq'::regclass);

-- Name: access_grant access_grant_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.access_grant
    ADD CONSTRAINT access_grant_pkey PRIMARY KEY (id);

-- Name: audit_event audit_event_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.audit_event
    ADD CONSTRAINT audit_event_pkey PRIMARY KEY (id);

-- Name: customer_quote_line customer_quote_line_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.customer_quote_line
    ADD CONSTRAINT customer_quote_line_pkey PRIMARY KEY (id);

-- Name: customer_quote customer_quote_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.customer_quote
    ADD CONSTRAINT customer_quote_pkey PRIMARY KEY (id);

-- Name: file_access_log file_access_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.file_access_log
    ADD CONSTRAINT file_access_log_pkey PRIMARY KEY (id);

-- Name: file_object file_object_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.file_object
    ADD CONSTRAINT file_object_pkey PRIMARY KEY (id);

-- Name: fx_rate_snapshot fx_rate_snapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.fx_rate_snapshot
    ADD CONSTRAINT fx_rate_snapshot_pkey PRIMARY KEY (id);

-- Name: lead lead_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.lead
    ADD CONSTRAINT lead_pkey PRIMARY KEY (id);

-- Name: ops_user ops_user_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ops_user
    ADD CONSTRAINT ops_user_pkey PRIMARY KEY (id);

-- Name: order_line order_line_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.order_line
    ADD CONSTRAINT order_line_pkey PRIMARY KEY (id);

-- Name: part_file part_file_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.part_file
    ADD CONSTRAINT part_file_pkey PRIMARY KEY (id);

-- Name: part part_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.part
    ADD CONSTRAINT part_pkey PRIMARY KEY (id);

-- Name: part_revision part_revision_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.part_revision
    ADD CONSTRAINT part_revision_pkey PRIMARY KEY (id);

-- Name: party party_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.party
    ADD CONSTRAINT party_pkey PRIMARY KEY (id);

-- Name: party_user party_user_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.party_user
    ADD CONSTRAINT party_user_pkey PRIMARY KEY (id);

-- Name: pricing_rule pricing_rule_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.pricing_rule
    ADD CONSTRAINT pricing_rule_pkey PRIMARY KEY (id);

-- Name: production_milestone production_milestone_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.production_milestone
    ADD CONSTRAINT production_milestone_pkey PRIMARY KEY (id);

-- Name: production_order_item production_order_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.production_order_item
    ADD CONSTRAINT production_order_item_pkey PRIMARY KEY (id);

-- Name: production_order production_order_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.production_order
    ADD CONSTRAINT production_order_pkey PRIMARY KEY (id);

-- Name: quote_approval quote_approval_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.quote_approval
    ADD CONSTRAINT quote_approval_pkey PRIMARY KEY (id);

-- Name: rfq_attachment rfq_attachment_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.rfq_attachment
    ADD CONSTRAINT rfq_attachment_pkey PRIMARY KEY (id);

-- Name: rfq_item rfq_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.rfq_item
    ADD CONSTRAINT rfq_item_pkey PRIMARY KEY (id);

-- Name: rfq rfq_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.rfq
    ADD CONSTRAINT rfq_pkey PRIMARY KEY (id);

-- Name: sales_order sales_order_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.sales_order
    ADD CONSTRAINT sales_order_pkey PRIMARY KEY (id);

-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (filename);

-- Name: sourcing_item sourcing_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.sourcing_item
    ADD CONSTRAINT sourcing_item_pkey PRIMARY KEY (id);

-- Name: sourcing_package sourcing_package_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.sourcing_package
    ADD CONSTRAINT sourcing_package_pkey PRIMARY KEY (id);

-- Name: spec_template spec_template_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.spec_template
    ADD CONSTRAINT spec_template_pkey PRIMARY KEY (id);

-- Name: supplier_capability supplier_capability_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.supplier_capability
    ADD CONSTRAINT supplier_capability_pkey PRIMARY KEY (id);

-- Name: supplier_invitation supplier_invitation_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.supplier_invitation
    ADD CONSTRAINT supplier_invitation_pkey PRIMARY KEY (id);

-- Name: supplier_quote_line supplier_quote_line_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.supplier_quote_line
    ADD CONSTRAINT supplier_quote_line_pkey PRIMARY KEY (id);

-- Name: supplier_quote supplier_quote_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.supplier_quote
    ADD CONSTRAINT supplier_quote_pkey PRIMARY KEY (id);

-- Name: access_grant_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX access_grant_uk ON public.access_grant USING btree (user_id, resource_key, action);

-- Name: audit_event_action_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX audit_event_action_idx ON public.audit_event USING btree (action, created_at DESC);

-- Name: audit_event_actor_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX audit_event_actor_idx ON public.audit_event USING btree (actor_user_id, created_at DESC);

-- Name: audit_event_target_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX audit_event_target_idx ON public.audit_event USING btree (target_type, target_id, created_at DESC);

-- Name: customer_quote_customer_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX customer_quote_customer_idx ON public.customer_quote USING btree (customer_party_id, created_at DESC);

-- Name: customer_quote_expiry_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX customer_quote_expiry_idx ON public.customer_quote USING btree (valid_until) WHERE (status = 'SENT'::text);

-- Name: customer_quote_line_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX customer_quote_line_uk ON public.customer_quote_line USING btree (customer_quote_id, line_no);

-- Name: customer_quote_no_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX customer_quote_no_uk ON public.customer_quote USING btree (quote_no, version);

-- Name: customer_quote_rfq_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX customer_quote_rfq_idx ON public.customer_quote USING btree (rfq_id, version DESC);

-- Name: file_access_log_file_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX file_access_log_file_idx ON public.file_access_log USING btree (file_object_id, accessed_at DESC);

-- Name: file_access_log_party_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX file_access_log_party_idx ON public.file_access_log USING btree (accessor_party_id, accessed_at DESC);

-- Name: file_access_log_revision_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX file_access_log_revision_idx ON public.file_access_log USING btree (part_revision_id, accessed_at DESC);

-- Name: file_object_owner_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX file_object_owner_idx ON public.file_object USING btree (owner_party_id);

-- Name: file_object_status_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX file_object_status_idx ON public.file_object USING btree (upload_status, created_at);

-- Name: fx_rate_snapshot_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX fx_rate_snapshot_idx ON public.fx_rate_snapshot USING btree (base_currency, quote_currency, fetched_at DESC);

-- Name: idx_part_customer_system_no; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_part_customer_system_no ON public.part USING btree (customer_party_id, customer_system_no) WHERE (customer_system_no IS NOT NULL);

-- Name: idx_part_customer_topic_no; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_part_customer_topic_no ON public.part USING btree (customer_party_id, customer_topic_no) WHERE (customer_topic_no IS NOT NULL);

-- Name: idx_rfq_item_customer_task_no; Type: INDEX; Schema: public; Owner: -

CREATE INDEX idx_rfq_item_customer_task_no ON public.rfq_item USING btree (customer_task_no) WHERE (customer_task_no IS NOT NULL);

-- Name: lead_status_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX lead_status_idx ON public.lead USING btree (status, created_at DESC);

-- Name: ops_user_email_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX ops_user_email_uk ON public.ops_user USING btree (lower(email)) WHERE (email IS NOT NULL);

-- Name: ops_user_wework_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX ops_user_wework_uk ON public.ops_user USING btree (wework_id) WHERE (wework_id IS NOT NULL);

-- Name: order_line_revision_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX order_line_revision_idx ON public.order_line USING btree (part_revision_id);

-- Name: order_line_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX order_line_uk ON public.order_line USING btree (order_id, line_no);

-- Name: part_customer_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX part_customer_idx ON public.part USING btree (customer_party_id);

-- Name: part_customer_partno_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX part_customer_partno_uk ON public.part USING btree (customer_party_id, customer_part_no) WHERE (customer_part_no IS NOT NULL);

-- Name: part_file_revision_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX part_file_revision_idx ON public.part_file USING btree (part_revision_id, kind);

-- Name: part_file_watermark_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX part_file_watermark_uk ON public.part_file USING btree (part_revision_id, watermark_party_id, watermark_batch) WHERE (kind = 'WATERMARKED'::text);

-- Name: part_revision_part_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX part_revision_part_idx ON public.part_revision USING btree (part_id, created_at DESC);

-- Name: part_revision_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX part_revision_uk ON public.part_revision USING btree (part_id, rev_code);

-- Name: party_code_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX party_code_uk ON public.party USING btree (code);

-- Name: party_type_status_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX party_type_status_idx ON public.party USING btree (type, status);

-- Name: party_user_email_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX party_user_email_uk ON public.party_user USING btree (lower(email)) WHERE (email IS NOT NULL);

-- Name: party_user_party_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX party_user_party_idx ON public.party_user USING btree (party_id);

-- Name: party_user_phone_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX party_user_phone_uk ON public.party_user USING btree (phone) WHERE (phone IS NOT NULL);

-- Name: pricing_rule_active_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX pricing_rule_active_idx ON public.pricing_rule USING btree (kind, status, effective_from DESC);

-- Name: pricing_rule_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX pricing_rule_uk ON public.pricing_rule USING btree (code, version);

-- Name: production_milestone_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX production_milestone_uk ON public.production_milestone USING btree (production_order_id, code);

-- Name: production_order_item_line_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX production_order_item_line_idx ON public.production_order_item USING btree (order_line_id);

-- Name: production_order_item_po_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX production_order_item_po_idx ON public.production_order_item USING btree (production_order_id);

-- Name: production_order_no_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX production_order_no_uk ON public.production_order USING btree (production_no);

-- Name: production_order_order_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX production_order_order_idx ON public.production_order USING btree (order_id);

-- Name: production_order_supplier_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX production_order_supplier_idx ON public.production_order USING btree (supplier_party_id, status);

-- Name: quote_approval_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX quote_approval_uk ON public.quote_approval USING btree (customer_quote_id, step_no);

-- Name: rfq_attachment_rfq_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX rfq_attachment_rfq_idx ON public.rfq_attachment USING btree (rfq_id);

-- Name: rfq_customer_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX rfq_customer_idx ON public.rfq USING btree (customer_party_id, created_at DESC);

-- Name: rfq_item_line_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX rfq_item_line_uk ON public.rfq_item USING btree (rfq_id, line_no);

-- Name: rfq_item_rev_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX rfq_item_rev_idx ON public.rfq_item USING btree (part_revision_id);

-- Name: rfq_no_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX rfq_no_uk ON public.rfq USING btree (rfq_no);

-- Name: rfq_status_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX rfq_status_idx ON public.rfq USING btree (status, created_at DESC);

-- Name: sales_order_customer_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX sales_order_customer_idx ON public.sales_order USING btree (customer_party_id, created_at DESC);

-- Name: sales_order_no_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX sales_order_no_uk ON public.sales_order USING btree (order_no);

-- Name: sales_order_quote_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX sales_order_quote_uk ON public.sales_order USING btree (customer_quote_id);

-- Name: sales_order_status_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX sales_order_status_idx ON public.sales_order USING btree (status, created_at DESC);

-- Name: sourcing_item_line_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX sourcing_item_line_uk ON public.sourcing_item USING btree (sourcing_package_id, line_no);

-- Name: sourcing_package_no_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX sourcing_package_no_uk ON public.sourcing_package USING btree (package_no);

-- Name: sourcing_package_rfq_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX sourcing_package_rfq_idx ON public.sourcing_package USING btree (rfq_id);

-- Name: spec_template_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX spec_template_uk ON public.spec_template USING btree (category, version);

-- Name: supplier_capability_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX supplier_capability_uk ON public.supplier_capability USING btree (supplier_party_id, category);

-- Name: supplier_invitation_supplier_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX supplier_invitation_supplier_idx ON public.supplier_invitation USING btree (supplier_party_id, status, invited_at DESC);

-- Name: supplier_invitation_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX supplier_invitation_uk ON public.supplier_invitation USING btree (sourcing_package_id, supplier_party_id);

-- Name: supplier_quote_invitation_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX supplier_quote_invitation_uk ON public.supplier_quote USING btree (invitation_id);

-- Name: supplier_quote_line_uk; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX supplier_quote_line_uk ON public.supplier_quote_line USING btree (supplier_quote_id, sourcing_item_id, qty);

-- Name: supplier_quote_package_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX supplier_quote_package_idx ON public.supplier_quote USING btree (sourcing_package_id, status);

-- Name: production_order_item production_allocation_guard; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER production_allocation_guard AFTER INSERT OR UPDATE OF qty, order_line_id ON public.production_order_item FOR EACH ROW EXECUTE FUNCTION public.check_production_allocation();

-- PostgreSQL database dump complete

