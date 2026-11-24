-- 发货（2026-11-24 需求方拍板，设计文档 12 §2 / §4 的发货段）：
--
--   * 供应商「发给平台」：承运商 + 运单号必填。返工 / 重做的行修好后会再发一次，
--     所以每发一次记一条 supplier_shipment，零件行记自己是哪一批发出的（supplier_shipment_id）。
--   * 运营把整单发给客户：承运商 + 运单号必填，整单只发一次（文档 12 已拍板），所以直接放在 customer_order 上。
--     客户点「确认收货」→ COMPLETED。承运商是自由文本（三方运输公司还没定）。
--   * 随货文件（质检报告 / 材质证明，不分类）：运营手动上传，PDF / JPG / PNG，发货前后都能传，客户确认收货后不能再传；
--     客户和运营都能下载，每签发一次下载链接记一条审计（CLAUDE.md §3 铁律 6）。
--
-- 归属：全部 domain/order（订单域）。随货文件挂在客户订单下，不是通用附件 ——
-- 图纸那套（part_file / part_file_access_log）挂在零件版本下，语义不同，不复用。
-- 只加可空列、新表、放宽 CHECK，旧版本代码面对新 schema 照常运行，无需扩展-收缩。
-- （回滚风险在数据上：库里一旦有 SHIPPED / COMPLETED 的客户订单，旧版本读到不认识的枚举值会出错。）

-- ---------- 客户订单：发货信息 + 两个新状态 ----------

ALTER TABLE customer_order ADD COLUMN IF NOT EXISTS shipment_carrier text;
ALTER TABLE customer_order ADD COLUMN IF NOT EXISTS shipment_tracking_no text;
ALTER TABLE customer_order ADD COLUMN IF NOT EXISTS shipped_at timestamptz;
ALTER TABLE customer_order ADD COLUMN IF NOT EXISTS shipped_by_ops_user_id uuid;
ALTER TABLE customer_order ADD COLUMN IF NOT EXISTS received_at timestamptz;

ALTER TABLE customer_order DROP CONSTRAINT IF EXISTS customer_order_status_chk;
ALTER TABLE customer_order ADD CONSTRAINT customer_order_status_chk CHECK (
    status IN ('DRAFT', 'SUBMITTED', 'QUOTED', 'CONFIRMED', 'READY', 'SHIPPED', 'COMPLETED', 'CANCELLED'));

-- ---------- 供应商发给平台：每发一次一条 ----------

CREATE TABLE IF NOT EXISTS supplier_shipment (
    id                  uuid        PRIMARY KEY,
    supplier_order_id   uuid        NOT NULL,
    supplier_org_id     uuid        NOT NULL,
    carrier             text        NOT NULL,
    tracking_no         text        NOT NULL,
    shipped_by_user_id  uuid        NOT NULL,
    shipped_at          timestamptz NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    version             bigint      NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS supplier_shipment_order_idx ON supplier_shipment (supplier_order_id, shipped_at);

ALTER TABLE supplier_order_part ADD COLUMN IF NOT EXISTS supplier_shipment_id uuid;
CREATE INDEX IF NOT EXISTS supplier_order_part_shipment_idx ON supplier_order_part (supplier_shipment_id);

-- ---------- 随货文件 + 下载审计 ----------

CREATE TABLE IF NOT EXISTS customer_order_document (
    id                       uuid        PRIMARY KEY,
    customer_order_id        uuid        NOT NULL,
    customer_org_id          uuid        NOT NULL,   -- 冗余，按客户过滤（§3 铁律 2）
    storage_key              text        NOT NULL,
    original_filename        text        NOT NULL,
    declared_content_type    text,
    detected_type            text,
    size_bytes               bigint,
    upload_status            text        NOT NULL,
    uploaded_by_ops_user_id  uuid        NOT NULL,
    completed_at             timestamptz,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    version                  bigint      NOT NULL DEFAULT 0,
    CONSTRAINT customer_order_document_status_chk CHECK (upload_status IN ('PENDING', 'COMPLETED', 'REJECTED'))
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_order_document_storage_key_uk ON customer_order_document (storage_key);
CREATE INDEX IF NOT EXISTS customer_order_document_order_idx ON customer_order_document (customer_order_id);
CREATE INDEX IF NOT EXISTS customer_order_document_customer_idx ON customer_order_document (customer_org_id);

CREATE TABLE IF NOT EXISTS customer_order_document_access_log (
    id                  bigserial   PRIMARY KEY,
    document_id         uuid        NOT NULL,
    customer_order_id   uuid        NOT NULL,
    customer_org_id     uuid        NOT NULL,
    accessor_user_id    uuid        NOT NULL,
    accessor_party_type text        NOT NULL,
    accessor_org_id     uuid,
    trace_id            text,
    accessed_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT customer_order_document_access_log_party_chk CHECK (accessor_party_type IN ('CUSTOMER', 'OPERATOR'))
);
CREATE INDEX IF NOT EXISTS customer_order_document_access_log_doc_idx
    ON customer_order_document_access_log (document_id, accessed_at DESC);
CREATE INDEX IF NOT EXISTS customer_order_document_access_log_order_idx
    ON customer_order_document_access_log (customer_order_id);
