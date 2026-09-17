-- 人工报价：运营逐行填原价 → 发出 → 客户确认 / 拒绝（设计文档 11 §4 第 3 步，文档 13）。归属 domain/quote。
--
-- 已拍板（出处见文档 13）：
--   * 原价：运营逐行填单价（CNY），系统只存（§2 / §2.05）。
--   * 对客价 = 原价 × 汇率 × 客户加成率，逐行列价 + 总计（§2 / §2.05）。
--   * 客户加成率：每客户一个数，填 1.2 = 乘 1.2（§2.1，2026-09-17）。
--   * 币种：每张报价现选，EUR / USD / GBP / CNY（§2.3，2026-09-17）。
--   * 对客单价四舍五入到 2 位；小计 = 单价 × 数量；总计 = Σ小计（2026-09-17）。
--   * 交期：运营填，整单一个，天数（确认后 N 天）（§2.06，2026-09-17）。
--   * 汇率：ECB 参考汇率，客户点确认那一刻才锁（§3.1）。确认前对客价随每天汇率变，不落库。
--   * 客户可拒绝（单回到待报价），运营可在客户确认前改价重发，每次重发留一版（2026-09-17）。
--   * 不设有效期（2026-09-17）。
--
-- 设计要点：
--   * 价格不往订单域的表加列（文档 13 §3.5），自己建表，裸 uuid 指回订单 / 订单行。
--   * 加成率放本域的 customer_markup，不往 organization（platform/identity）加列。
--   * quote.markup_rate 是发出时的快照：之后改客户加成率，不影响已发出的报价（CLAUDE.md §10 C2）。
--   * 确认时把汇率（日期、来源、EUR→CNY、EUR→对客币种）和每行对客单价、小计、总计写进来，此后不再算。
--     ECB 只给 EUR→X：CNY→X = (EUR→X) / (EUR→CNY)；对客币种是 EUR 时 EUR→X 记 1。
--   * quote_line 快照图号 / 名称 / 数量：订单行在草稿之后不再变，但报价是对外记录，按 C2 自包含。
--   * 每张订单最多一条 SENT、最多一条 CONFIRMED —— 部分唯一索引兜底并发（代码里另有订单行锁）。
--   * customer_org_id 冗余进两张表，租户条件直接进查询（CLAUDE.md §3 铁律 2）。
--
-- customer_order.status 加两个值（枚举加值，旧 jar 不受影响）；其余全是新表。
-- 无外键（§4），关联列都建了索引。幂等：全部 IF [NOT] EXISTS；CHECK 先 DROP IF EXISTS 再加。

-- ---------- customer_order ----------
ALTER TABLE customer_order DROP CONSTRAINT IF EXISTS customer_order_status_chk;
ALTER TABLE customer_order ADD CONSTRAINT customer_order_status_chk
    CHECK (status IN ('DRAFT', 'SUBMITTED', 'QUOTED', 'CONFIRMED', 'CANCELLED'));
CREATE INDEX IF NOT EXISTS customer_order_status_idx ON customer_order (status);

-- ---------- customer_markup ----------
CREATE TABLE IF NOT EXISTS customer_markup (
    id              uuid        PRIMARY KEY,
    customer_org_id uuid        NOT NULL,
    markup_rate     numeric(8, 4) NOT NULL,  -- 对客价 = 原价 × 汇率 × 本值；1.2 = 加价 20%
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    version         bigint      NOT NULL DEFAULT 0,
    CONSTRAINT customer_markup_rate_positive CHECK (markup_rate > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_markup_customer_uk ON customer_markup (customer_org_id);

-- ---------- quote ----------
CREATE TABLE IF NOT EXISTS quote (
    id                   uuid        PRIMARY KEY,
    customer_order_id    uuid        NOT NULL,
    customer_org_id      uuid        NOT NULL,
    version_no           integer     NOT NULL,   -- 同一张订单第几次报价，从 1 开始
    status               text        NOT NULL,
    currency             text        NOT NULL,   -- 对客币种
    lead_days            integer     NOT NULL,   -- 交期：客户确认后多少天
    markup_rate          numeric(8, 4) NOT NULL, -- 发出时的客户加成率快照
    sent_at              timestamptz NOT NULL,
    sent_by_user_id      uuid        NOT NULL,
    confirmed_at         timestamptz,
    confirmed_by_user_id uuid,
    rejected_at          timestamptz,
    rejected_by_user_id  uuid,
    fx_source            text,                   -- 以下确认时写入
    fx_rate_date         date,
    fx_eur_cny           numeric(18, 8),
    fx_eur_quote         numeric(18, 8),         -- 1 EUR 兑多少对客币种；对客币种是 EUR 时为 1
    total_amount         numeric(14, 2),         -- 对客总计（对客币种）
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    version              bigint      NOT NULL DEFAULT 0,
    CONSTRAINT quote_status_chk CHECK (status IN ('SENT', 'SUPERSEDED', 'REJECTED', 'CONFIRMED')),
    CONSTRAINT quote_currency_chk CHECK (currency IN ('EUR', 'USD', 'GBP', 'CNY')),
    CONSTRAINT quote_lead_days_positive CHECK (lead_days > 0),
    CONSTRAINT quote_version_no_positive CHECK (version_no > 0),
    CONSTRAINT quote_markup_rate_positive CHECK (markup_rate > 0),
    CONSTRAINT quote_fx_source_chk CHECK (fx_source IS NULL OR fx_source IN ('ECB')),
    CONSTRAINT quote_confirmed_snapshot_chk CHECK (status <> 'CONFIRMED' OR (
        confirmed_at IS NOT NULL AND confirmed_by_user_id IS NOT NULL
        AND fx_source IS NOT NULL AND fx_rate_date IS NOT NULL
        AND fx_eur_cny > 0 AND fx_eur_quote > 0 AND total_amount IS NOT NULL)),
    CONSTRAINT quote_rejected_chk CHECK (status <> 'REJECTED' OR (
        rejected_at IS NOT NULL AND rejected_by_user_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS quote_order_version_uk ON quote (customer_order_id, version_no);
CREATE UNIQUE INDEX IF NOT EXISTS quote_order_one_sent_uk ON quote (customer_order_id) WHERE status = 'SENT';
CREATE UNIQUE INDEX IF NOT EXISTS quote_order_one_confirmed_uk ON quote (customer_order_id) WHERE status = 'CONFIRMED';
CREATE INDEX IF NOT EXISTS quote_customer_status_idx ON quote (customer_org_id, status);

-- ---------- quote_line ----------
CREATE TABLE IF NOT EXISTS quote_line (
    id                     uuid        PRIMARY KEY,
    quote_id               uuid        NOT NULL,
    customer_order_part_id uuid        NOT NULL,
    customer_org_id        uuid        NOT NULL,
    line_no                integer     NOT NULL,  -- 行序，同订单行的顺序
    part_code              text        NOT NULL,  -- 以下三列是发出时订单行的快照
    part_name              text        NOT NULL,
    quantity               integer     NOT NULL,
    unit_price_cny         numeric(12, 2) NOT NULL, -- 原价（CNY / 件），运营填，仅内部
    unit_price             numeric(12, 2),          -- 对客单价（对客币种），确认时写入
    line_total             numeric(14, 2),          -- 对客小计 = unit_price × quantity，确认时写入
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    version                bigint      NOT NULL DEFAULT 0,
    CONSTRAINT quote_line_line_no_positive CHECK (line_no > 0),
    CONSTRAINT quote_line_quantity_positive CHECK (quantity >= 1),
    CONSTRAINT quote_line_unit_price_cny_positive CHECK (unit_price_cny > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS quote_line_quote_part_uk ON quote_line (quote_id, customer_order_part_id);
CREATE UNIQUE INDEX IF NOT EXISTS quote_line_quote_line_no_uk ON quote_line (quote_id, line_no);
CREATE INDEX IF NOT EXISTS quote_line_order_part_idx ON quote_line (customer_order_part_id);
CREATE INDEX IF NOT EXISTS quote_line_customer_idx ON quote_line (customer_org_id);
