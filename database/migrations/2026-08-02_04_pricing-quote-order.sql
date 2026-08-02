-- 定价 / 对客报价 / 订单 / 生产订单
--
-- ★ 本文件承载两个最高风险的设计（设计文档 3 §2.2 / §4）：
--   1. 报价行必须存全量定价分解快照 —— 历史单据自包含，绝不 join live 配置
--   2. 「客户点接受 = 正式订单」的五道护栏
--
-- ★ 注意：order 是 SQL 保留字，表名用 sales_order

-- ============================================================
-- 定价规则 ★是数据不是代码 —— 改毛利率 / 改运费档不需要发版
-- ============================================================

CREATE TABLE IF NOT EXISTS pricing_rule (
    id                  uuid PRIMARY KEY,
    code                text        NOT NULL,   -- TOOLING_AMORT / QC_STD / SEA_EU_W / MARGIN_TIER_B ...
    version             int         NOT NULL,
    kind                text        NOT NULL,
    -- SUPPLIER_COST | TOOLING | QC | PACKAGING | DOMESTIC_FREIGHT | EXPORT_FEE
    --   | INTL_FREIGHT | DUTY | CUSTOMS | MARGIN | FX_BUFFER
    -- ★ 解决「价格口径还没定」：国际运费和关税标注 {DAP,DDP}，EXW/FOB 下自动不计入。
    --   将来贸易条款定了，改这个数组即可，不改代码。
    applies_to_incoterms text[]     NOT NULL DEFAULT '{EXW,FOB,CIF,DAP,DDP}',
    -- 分档表 / 系数 / 常量。形状按 kind 而定，由 PricingEngine 解释
    formula             jsonb       NOT NULL,
    effective_from      timestamptz NOT NULL DEFAULT now(),
    effective_to        timestamptz,
    status              text        NOT NULL DEFAULT 'ACTIVE',
    created_by_user_id  uuid        REFERENCES party_user (id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pricing_rule_status_chk CHECK (status IN ('DRAFT','ACTIVE','RETIRED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS pricing_rule_uk ON pricing_rule (code, version);
CREATE INDEX IF NOT EXISTS pricing_rule_active_idx ON pricing_rule (kind, status, effective_from DESC);


-- ============================================================
-- 汇率快照 ★护栏 4
-- ============================================================

CREATE TABLE IF NOT EXISTS fx_rate_snapshot (
    id                  uuid PRIMARY KEY,
    base_currency       text        NOT NULL,   -- CNY
    quote_currency      text        NOT NULL,   -- EUR
    rate                numeric(12,6) NOT NULL,
    source              text        NOT NULL,   -- ECB / 银行 / 手工
    fetched_at          timestamptz NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fx_rate_snapshot_idx
    ON fx_rate_snapshot (base_currency, quote_currency, fetched_at DESC);


-- ============================================================
-- 对客报价 ★因为「点接受即成单」，这是全系统风险最高的表
-- ============================================================

CREATE TABLE IF NOT EXISTS customer_quote (
    id                  uuid PRIMARY KEY,
    quote_no            text        NOT NULL,   -- Q-2026-0001
    version             int         NOT NULL DEFAULT 1,   -- 同一 RFQ 可以出多版报价
    rfq_id              uuid        NOT NULL REFERENCES rfq (id),
    customer_party_id   uuid        NOT NULL REFERENCES party (id),
    currency            text        NOT NULL DEFAULT 'EUR',
    incoterm            text        NOT NULL,
    total_amount        numeric(14,2) NOT NULL DEFAULT 0,
    -- 内部字段，★绝不出现在客户端 DTO（D4：对客先只看一口价）
    total_cost_cny      numeric(14,2),
    gross_margin_pct    numeric(6,4),

    -- ★护栏 1：强制有效期，NOT NULL。定时任务扫描过期自动转 EXPIRED（须加 Redis 锁）。
    --   客户端接受接口第一件事就是校验 now() < valid_until，过期直接 409。
    valid_until         timestamptz NOT NULL,

    status              text        NOT NULL DEFAULT 'DRAFT',
    -- DRAFT | PENDING_APPROVAL | APPROVED | SENT | ACCEPTED | REJECTED
    --   | EXPIRED | WITHDRAWN | INTERNAL_REJECTED
    withdraw_reason     text,                   -- ★护栏 5：撤回必须填理由
    reject_reason       text,

    -- ★ 乐观锁。接受/撤回可能并发：
    --   UPDATE customer_quote SET status='ACCEPTED'
    --    WHERE id=? AND status='SENT' AND valid_until > now()
    --   影响行数为 0 = 被抢先。绝不先查后写。
    lock_version        int         NOT NULL DEFAULT 0,

    prepared_by_user_id uuid        REFERENCES party_user (id),
    sent_at             timestamptz,
    responded_at        timestamptz,            -- 客户接受/拒绝的时刻
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT customer_quote_status_chk CHECK (status IN (
        'DRAFT','PENDING_APPROVAL','APPROVED','SENT','ACCEPTED',
        'REJECTED','EXPIRED','WITHDRAWN','INTERNAL_REJECTED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_quote_no_uk    ON customer_quote (quote_no, version);
CREATE INDEX IF NOT EXISTS customer_quote_rfq_idx         ON customer_quote (rfq_id, version DESC);
CREATE INDEX IF NOT EXISTS customer_quote_customer_idx    ON customer_quote (customer_party_id, created_at DESC);
-- 过期扫描任务用
CREATE INDEX IF NOT EXISTS customer_quote_expiry_idx      ON customer_quote (valid_until) WHERE status = 'SENT';


CREATE TABLE IF NOT EXISTS customer_quote_line (
    id                  uuid PRIMARY KEY,
    customer_quote_id   uuid        NOT NULL REFERENCES customer_quote (id) ON DELETE CASCADE,
    line_no             int         NOT NULL,
    rfq_item_id         uuid        NOT NULL REFERENCES rfq_item (id),
    part_revision_id    uuid        NOT NULL REFERENCES part_revision (id),
    qty                 int         NOT NULL,
    unit_price          numeric(14,4) NOT NULL,
    total_price         numeric(14,2) NOT NULL,
    lead_time_days      int,

    -- ============ ★ 快照区：全部是「当时」的值 ============
    -- 半年后客户问「为什么这次贵 12%」，靠这几列回答。
    -- 绝不 join live 的 pricing_rule / fx_rate 来渲染历史报价。
    pricing_rule_versions jsonb     NOT NULL DEFAULT '{}'::jsonb,  -- {"MARGIN_TIER_B": 4, ...}
    fx_rate             numeric(12,6),
    fx_buffer_pct       numeric(6,4),
    fx_snapshot_at      timestamptz,
    -- 每一项费用的金额和来源，形如：
    -- {"supplierCost":{"amountCny":12800,"supplierQuoteLineId":"..."},
    --  "intlFreight":{"amountCny":3200,"ruleRef":"SEA_EU_W_v5","chargeableWeightKg":128},
    --  "duty":{"amountCny":1900,"hsCode":"8466.93","destCountry":"DE","ratePct":2.7},
    --  "marginPct":{"value":0.22,"ruleRef":"MARGIN_TIER_B_v4"}}
    cost_breakdown      jsonb       NOT NULL DEFAULT '{}'::jsonb,
    -- 选用了哪家供应商的哪一行
    supplier_quote_line_id uuid     REFERENCES supplier_quote_line (id),
    -- ★ 没选最低价时必须填理由 —— 内部审计需要，也是将来做算法的训练数据
    selection_reason    text,
    -- ====================================================

    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT customer_quote_line_qty_chk CHECK (qty > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_quote_line_uk ON customer_quote_line (customer_quote_id, line_no);


-- ============================================================
-- 报价审批 ★护栏 2
-- 建议起步规则：
--   金额 < X 万欧            → 销售负责人单人审批
--   金额 >= X 万欧 或 毛利 < Y% → 需第二人（总经理/财务）复核
--   毛利为负                 → 硬阻断，不允许提交审批
-- ============================================================

CREATE TABLE IF NOT EXISTS quote_approval (
    id                  uuid PRIMARY KEY,
    customer_quote_id   uuid        NOT NULL REFERENCES customer_quote (id) ON DELETE CASCADE,
    step_no             int         NOT NULL,
    approver_user_id    uuid        NOT NULL REFERENCES party_user (id),
    decision            text        NOT NULL DEFAULT 'PENDING',
                                                -- PENDING | APPROVED | REJECTED
    comment             text,
    -- 审批时看到的数字（不可篡改）—— 事后改了报价不影响这条记录
    snapshot_total      numeric(14,2),
    snapshot_margin_pct numeric(6,4),
    decided_at          timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT quote_approval_decision_chk CHECK (decision IN ('PENDING','APPROVED','REJECTED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS quote_approval_uk ON quote_approval (customer_quote_id, step_no);


-- ============================================================
-- 订单（order 是保留字，用 sales_order）
-- ============================================================

CREATE TABLE IF NOT EXISTS sales_order (
    id                  uuid PRIMARY KEY,
    order_no            text        NOT NULL,   -- SO-2026-0001
    customer_party_id   uuid        NOT NULL REFERENCES party (id),
    rfq_id              uuid        NOT NULL REFERENCES rfq (id),
    -- 来源报价。价格/数量/交期从快照 ★复制，不是引用 —— 报价此后完全不可变
    customer_quote_id   uuid        NOT NULL REFERENCES customer_quote (id),
    currency            text        NOT NULL DEFAULT 'EUR',
    incoterm            text        NOT NULL,
    total_amount        numeric(14,2) NOT NULL,
    delivery_country    text,
    delivery_address    text,
    promised_delivery_date date,
    status              text        NOT NULL DEFAULT 'CONFIRMED',
    -- CONFIRMED | IN_PRODUCTION | QC | PACKED | SHIPPED | DELIVERED | CLOSED | CANCELLED
    cancel_reason       text,
    -- 账款只记状态，★不收款不清分
    payment_status      text        NOT NULL DEFAULT 'UNPAID',
                                                -- UNPAID | INVOICED | PARTIAL | PAID
    confirmed_at        timestamptz NOT NULL DEFAULT now(),
    closed_at           timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT sales_order_status_chk CHECK (status IN (
        'CONFIRMED','IN_PRODUCTION','QC','PACKED','SHIPPED','DELIVERED','CLOSED','CANCELLED')),
    CONSTRAINT sales_order_payment_chk CHECK (payment_status IN ('UNPAID','INVOICED','PARTIAL','PAID'))
);

CREATE UNIQUE INDEX IF NOT EXISTS sales_order_no_uk       ON sales_order (order_no);
-- 一份报价只能接受一次
CREATE UNIQUE INDEX IF NOT EXISTS sales_order_quote_uk    ON sales_order (customer_quote_id);
CREATE INDEX IF NOT EXISTS sales_order_customer_idx       ON sales_order (customer_party_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sales_order_status_idx         ON sales_order (status, created_at DESC);


CREATE TABLE IF NOT EXISTS order_line (
    id                  uuid PRIMARY KEY,
    order_id            uuid        NOT NULL REFERENCES sales_order (id) ON DELETE CASCADE,
    line_no             int         NOT NULL,
    part_revision_id    uuid        NOT NULL REFERENCES part_revision (id),
    quote_line_id       uuid        REFERENCES customer_quote_line (id),
    qty                 int         NOT NULL,
    unit_price          numeric(14,4) NOT NULL,
    total_price         numeric(14,2) NOT NULL,
    promised_date       date,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT order_line_qty_chk CHECK (qty > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS order_line_uk       ON order_line (order_id, line_no);
CREATE INDEX IF NOT EXISTS order_line_revision_idx    ON order_line (part_revision_id);


-- ============================================================
-- 生产订单 ★D3：同一零件可能拆给多家供应商
-- ============================================================

CREATE TABLE IF NOT EXISTS production_order (
    id                  uuid PRIMARY KEY,
    production_no       text        NOT NULL,   -- PO-2026-0001，供应商看到的编号
    order_id            uuid        NOT NULL REFERENCES sales_order (id),
    supplier_party_id   uuid        NOT NULL REFERENCES party (id),
    currency            text        NOT NULL DEFAULT 'CNY',
    total_cost          numeric(14,2) NOT NULL DEFAULT 0,
    due_date            date,
    status              text        NOT NULL DEFAULT 'DRAFT',
    -- DRAFT | ISSUED | ACCEPTED | REJECTED | IN_PROGRESS
    --   | SUBMITTED_FOR_QC | REWORK | DONE | CANCELLED
    reject_reason       text,
    issued_by_user_id   uuid        REFERENCES party_user (id),
    issued_at           timestamptz,
    accepted_at         timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT production_order_status_chk CHECK (status IN (
        'DRAFT','ISSUED','ACCEPTED','REJECTED','IN_PROGRESS',
        'SUBMITTED_FOR_QC','REWORK','DONE','CANCELLED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS production_order_no_uk   ON production_order (production_no);
CREATE INDEX IF NOT EXISTS production_order_order_idx      ON production_order (order_id);
CREATE INDEX IF NOT EXISTS production_order_supplier_idx   ON production_order (supplier_party_id, status);


-- ★ 拆分点：一个订单行 → 多个生产订单明细
CREATE TABLE IF NOT EXISTS production_order_item (
    id                  uuid PRIMARY KEY,
    production_order_id uuid        NOT NULL REFERENCES production_order (id) ON DELETE CASCADE,
    order_line_id       uuid        NOT NULL REFERENCES order_line (id),
    part_revision_id    uuid        NOT NULL REFERENCES part_revision (id),
    qty                 int         NOT NULL,
    unit_cost           numeric(14,4) NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT production_order_item_qty_chk CHECK (qty > 0)
);

CREATE INDEX IF NOT EXISTS production_order_item_po_idx   ON production_order_item (production_order_id);
CREATE INDEX IF NOT EXISTS production_order_item_line_idx ON production_order_item (order_line_id);


-- ★★ 拆单核心不变式：
--     ∀ order_line L : Σ(production_order_item.qty WHERE order_line_id = L.id) <= L.qty
--
--  PostgreSQL 的 CHECK 表达不了跨行聚合，用触发器。
--  这是三层守护的第一层；Service 层还要在同一事务内 SELECT ... FOR UPDATE 订单行再校验，
--  集成测试必须覆盖：并发分配 / 超额分配 / 部分分配后取消。
--  （不用 DO $$ 块 —— 迁移执行器按 ";" 切语句，不认美元引号。
--    函数体用单引号字符串形式定义。）

CREATE OR REPLACE FUNCTION check_production_allocation() RETURNS trigger AS
'
BEGIN
    IF (SELECT COALESCE(SUM(poi.qty), 0)
          FROM production_order_item poi
         WHERE poi.order_line_id = NEW.order_line_id)
       > (SELECT ol.qty FROM order_line ol WHERE ol.id = NEW.order_line_id)
    THEN
        RAISE EXCEPTION ''ALLOCATION_EXCEEDS_ORDER_LINE_QTY: order_line_id=%'', NEW.order_line_id;
    END IF;
    RETURN NEW;
END;
' LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS production_allocation_guard ON production_order_item;
CREATE TRIGGER production_allocation_guard
    AFTER INSERT OR UPDATE OF qty, order_line_id ON production_order_item
    FOR EACH ROW EXECUTE FUNCTION check_production_allocation();


-- 「未分配数量」视图 —— 采购看板直接用，否则一定会漏分
CREATE OR REPLACE VIEW order_line_allocation AS
SELECT ol.id                                        AS order_line_id,
       ol.order_id,
       ol.qty                                       AS ordered_qty,
       COALESCE(SUM(poi.qty), 0)                    AS allocated_qty,
       ol.qty - COALESCE(SUM(poi.qty), 0)           AS unallocated_qty
  FROM order_line ol
  LEFT JOIN production_order_item poi ON poi.order_line_id = ol.id
 GROUP BY ol.id, ol.order_id, ol.qty;


-- 生产里程碑
CREATE TABLE IF NOT EXISTS production_milestone (
    id                  uuid PRIMARY KEY,
    production_order_id uuid        NOT NULL REFERENCES production_order (id) ON DELETE CASCADE,
    code                text        NOT NULL,   -- MATERIAL_READY | MACHINING | SURFACE | SELF_QC | READY_TO_SHIP
    planned_date        date,
    actual_date         date,
    status              text        NOT NULL DEFAULT 'PENDING',
                                                -- PENDING | DONE | DELAYED
    note                text,
    reported_by_user_id uuid        REFERENCES party_user (id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS production_milestone_uk ON production_milestone (production_order_id, code);
