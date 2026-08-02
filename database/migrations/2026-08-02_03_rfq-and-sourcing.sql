-- 询价（客户侧）与寻源（供应商侧）
--
-- ★ 本文件体现最重要的架构决策：投影分离（设计文档 2 §3.2）
--
--   rfq / rfq_item                  客户侧真相 —— 含客户身份、目标价、终端用途
--          │
--          │ 后台执行「下发寻源」，生成 ↓
--          ▼
--   sourcing_package / sourcing_item   发给供应商的匿名包（物理上独立的表）
--
--   供应商端的所有查询根本碰不到 rfq 表 —— 泄露在数据层就不可能发生，
--   而不是靠「记得过滤字段」。

-- ============================================================
-- 线索（官网 Request a Quote）
-- ============================================================

CREATE TABLE IF NOT EXISTS lead (
    id                  uuid PRIMARY KEY,
    company_name        text,
    contact_name        text,
    email               text        NOT NULL,
    phone               text,
    country             text,
    message             text,
    source              text,                   -- website | referral | exhibition ...
    utm                 jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              text        NOT NULL DEFAULT 'NEW',
                                                -- NEW | CONTACTED | CONVERTED | DISQUALIFIED
    converted_party_id  uuid        REFERENCES party (id),
    ip_hash             text,                   -- 公开端点，防刷用；不存原始 IP
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_status_idx ON lead (status, created_at DESC);


-- ============================================================
-- 询价单（客户侧）
-- ============================================================

CREATE TABLE IF NOT EXISTS rfq (
    id                  uuid PRIMARY KEY,
    rfq_no              text        NOT NULL,   -- RFQ-2026-0001，展示用
    customer_party_id   uuid        NOT NULL REFERENCES party (id),
    submitted_by_user_id uuid       REFERENCES party_user (id),
    title               text,
    -- 客户侧信息 ★这些字段永远不进 sourcing_package
    target_price_eur    numeric(14,2),
    end_use             text,                   -- 终端用途，可能泄露客户所在行业
    delivery_country    text,
    delivery_address    text,
    required_by         date,
    incoterm            text,                   -- EXW | FOB | CIF | DAP | DDP
    currency            text        NOT NULL DEFAULT 'EUR',
    status              text        NOT NULL DEFAULT 'DRAFT',
    -- DRAFT | SUBMITTED | UNDER_REVIEW | NEED_INFO | SOURCING | QUOTED
    --   | WON | LOST | EXPIRED | DECLINED
    decline_reason      text,
    owner_user_id       uuid        REFERENCES party_user (id),  -- 内部负责人
    submitted_at        timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT rfq_status_chk CHECK (status IN (
        'DRAFT','SUBMITTED','UNDER_REVIEW','NEED_INFO','SOURCING',
        'QUOTED','WON','LOST','EXPIRED','DECLINED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS rfq_no_uk         ON rfq (rfq_no);
CREATE INDEX        IF NOT EXISTS rfq_customer_idx  ON rfq (customer_party_id, created_at DESC);
CREATE INDEX        IF NOT EXISTS rfq_status_idx    ON rfq (status, created_at DESC);


CREATE TABLE IF NOT EXISTS rfq_item (
    id                  uuid PRIMARY KEY,
    rfq_id              uuid        NOT NULL REFERENCES rfq (id) ON DELETE CASCADE,
    line_no             int         NOT NULL,
    part_revision_id    uuid        NOT NULL REFERENCES part_revision (id),
    qty                 int         NOT NULL,
    -- 数量阶梯：非标件的工装/编程/首件是固定成本，摊到不同数量上单价差异巨大。
    -- 每一档都是一次完整计算，不是在基准价上打折。
    qty_tiers           int[]       NOT NULL DEFAULT '{}',   -- 例 {10,50,100,500}
    remark              text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT rfq_item_qty_chk CHECK (qty > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS rfq_item_line_uk ON rfq_item (rfq_id, line_no);
CREATE INDEX        IF NOT EXISTS rfq_item_rev_idx ON rfq_item (part_revision_id);


CREATE TABLE IF NOT EXISTS rfq_attachment (
    id                  uuid PRIMARY KEY,
    rfq_id              uuid        NOT NULL REFERENCES rfq (id) ON DELETE CASCADE,
    file_object_id      uuid        NOT NULL REFERENCES file_object (id),
    kind                text        NOT NULL,   -- TECH_SPEC | INSPECTION_STD | MODEL_3D | OTHER
    -- ★ 附件也要脱敏才能下发。默认不可下发，后台确认后置 true
    shareable_to_supplier boolean   NOT NULL DEFAULT false,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rfq_attachment_rfq_idx ON rfq_attachment (rfq_id);


-- ============================================================
-- 寻源包 ★匿名投影 —— 供应商端只能看到这一侧
-- ============================================================

CREATE TABLE IF NOT EXISTS sourcing_package (
    id                  uuid PRIMARY KEY,
    package_no          text        NOT NULL,   -- SP-2026-0001，供应商看到的编号
    -- 内部关联，★绝不出现在任何供应商端 DTO 里
    rfq_id              uuid        NOT NULL REFERENCES rfq (id),
    -- 下发时快照的技术信息（脱去所有客户信息）
    title               text,                   -- 中性标题，如「铝合金结构件 5 项」
    -- 交期窗口而不是具体客户要求日期 —— 具体日期可能反推出客户的项目节奏
    delivery_window_from date,
    delivery_window_to   date,
    remark              text,
    status              text        NOT NULL DEFAULT 'DRAFT',
                                                -- DRAFT | DISPATCHED | CLOSED | CANCELLED
    dispatched_by_user_id uuid      REFERENCES party_user (id),
    dispatched_at       timestamptz,
    quote_due_at        timestamptz,            -- 要求供应商何时前报价
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT sourcing_package_status_chk
        CHECK (status IN ('DRAFT','DISPATCHED','CLOSED','CANCELLED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS sourcing_package_no_uk  ON sourcing_package (package_no);
CREATE INDEX        IF NOT EXISTS sourcing_package_rfq_idx ON sourcing_package (rfq_id);


CREATE TABLE IF NOT EXISTS sourcing_item (
    id                  uuid PRIMARY KEY,
    sourcing_package_id uuid        NOT NULL REFERENCES sourcing_package (id) ON DELETE CASCADE,
    line_no             int         NOT NULL,
    -- 内部关联，★不出现在供应商端 DTO
    rfq_item_id         uuid        NOT NULL REFERENCES rfq_item (id),
    part_revision_id    uuid        NOT NULL REFERENCES part_revision (id),
    -- 下发时快照的规格（避免供应商报完价后规格被改）
    qty                 int         NOT NULL,
    qty_tiers           int[]       NOT NULL DEFAULT '{}',
    material            text,
    tolerance_grade     text,
    surface_treatment   text,
    heat_treatment      text,
    spec_snapshot       jsonb       NOT NULL DEFAULT '{}'::jsonb,
    remark              text,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sourcing_item_line_uk ON sourcing_item (sourcing_package_id, line_no);


-- ============================================================
-- 供应商邀请与报价
-- ============================================================

CREATE TABLE IF NOT EXISTS supplier_invitation (
    id                  uuid PRIMARY KEY,
    sourcing_package_id uuid        NOT NULL REFERENCES sourcing_package (id) ON DELETE CASCADE,
    supplier_party_id   uuid        NOT NULL REFERENCES party (id),
    status              text        NOT NULL DEFAULT 'INVITED',
                                                -- INVITED | VIEWED | QUOTED | DECLINED | EXPIRED
    decline_reason      text,
    -- 水印批次：这个供应商拿到的是哪一批带水印的图纸
    watermark_batch     text        NOT NULL,
    invited_at          timestamptz NOT NULL DEFAULT now(),
    first_viewed_at     timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT supplier_invitation_status_chk
        CHECK (status IN ('INVITED','VIEWED','QUOTED','DECLINED','EXPIRED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS supplier_invitation_uk
    ON supplier_invitation (sourcing_package_id, supplier_party_id);
CREATE INDEX IF NOT EXISTS supplier_invitation_supplier_idx
    ON supplier_invitation (supplier_party_id, status, invited_at DESC);


CREATE TABLE IF NOT EXISTS supplier_quote (
    id                  uuid PRIMARY KEY,
    invitation_id       uuid        NOT NULL REFERENCES supplier_invitation (id),
    supplier_party_id   uuid        NOT NULL REFERENCES party (id),
    sourcing_package_id uuid        NOT NULL REFERENCES sourcing_package (id),
    currency            text        NOT NULL DEFAULT 'CNY',
    -- ★护栏 3：发对客报价时强制校验 supplier_quote.valid_until >= customer_quote.valid_until
    --   防的是：对客报了 30 天，供应商只保 7 天，第 20 天客户接受了，供应商说要涨价
    valid_until         timestamptz NOT NULL,
    lead_time_days      int,                    -- 整包交期
    tooling_fee_cny     numeric(14,2) NOT NULL DEFAULT 0,
    remark              text,
    status              text        NOT NULL DEFAULT 'SUBMITTED',
                                                -- SUBMITTED | SELECTED | NOT_SELECTED | EXPIRED
    submitted_by_user_id uuid       REFERENCES party_user (id),
    submitted_at        timestamptz NOT NULL DEFAULT now(),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT supplier_quote_status_chk
        CHECK (status IN ('SUBMITTED','SELECTED','NOT_SELECTED','EXPIRED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS supplier_quote_invitation_uk ON supplier_quote (invitation_id);
CREATE INDEX IF NOT EXISTS supplier_quote_package_idx ON supplier_quote (sourcing_package_id, status);


CREATE TABLE IF NOT EXISTS supplier_quote_line (
    id                  uuid PRIMARY KEY,
    supplier_quote_id   uuid        NOT NULL REFERENCES supplier_quote (id) ON DELETE CASCADE,
    sourcing_item_id    uuid        NOT NULL REFERENCES sourcing_item (id),
    qty                 int         NOT NULL,   -- 对应哪个数量档
    unit_price_cny      numeric(14,4) NOT NULL,
    lead_time_days      int,
    moq                 int,
    remark              text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT supplier_quote_line_price_chk CHECK (unit_price_cny >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS supplier_quote_line_uk
    ON supplier_quote_line (supplier_quote_id, sourcing_item_id, qty);


-- ============================================================
-- 供应商能力库（下发时筛选用）
-- ★ MVP 不做评分算法（个位数供应商，人工判断比算法准），但表现要记录
-- ============================================================

CREATE TABLE IF NOT EXISTS supplier_capability (
    id                  uuid PRIMARY KEY,
    supplier_party_id   uuid        NOT NULL REFERENCES party (id),
    category            text        NOT NULL,   -- 对应 spec_template.category
    materials           text[]      NOT NULL DEFAULT '{}',
    max_dimension_mm    numeric(10,2),
    min_tolerance_mm    numeric(10,4),
    monthly_capacity    int,
    equipment_note      text,
    certifications      text[]      NOT NULL DEFAULT '{}',   -- ISO9001 / IATF16949 ...
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS supplier_capability_uk
    ON supplier_capability (supplier_party_id, category);
