-- 组生产订单 → 派单 → 供应商接单（设计文档 11 §4 第 4 步 4b，文档 12 §3 §4，2026-09-18 需求方拍板）。
--
-- 已拍板：
--   * 本轮做到供应商接单为止；合同 / 签字放下一轮（文档 11，2026-09-18）。
--   * 派法运营每单二选一：定向派几家（先到先得）/ 挂全市场（所有可派单供应商，先到先得）（文档 12 §3）。
--   * 定向派的几家里有人拒接：只把他移出，其余照常可接；全部拒接才回运营待派（2026-09-18）。
--   * 一张生产订单整单交给一家，可以装多个客户订单的零件（D13）。
--   * 同一零件行可以拆给多家，一次拆完：各份之和 = 该行数量（文档 12 §1，2026-09-18）。
--   * 签字前双方可退：供应商退单、运营收回，生产订单回到组装中重派（文档 12 §4）。
--   * 对供价 = 原价 × 该供应商折率；对供交期运营每次派单时手填（文档 13 §2.2 / §2.06，2026-09-18）。
--   * 供应商派到就能看图，每次看落审计（2026-09-18）。
--
-- 设计要点：
--   * ops_order.dispatch_round：每派一次（定向或挂市场）加 1。收回后再派是新的一轮，
--     定向记录按 (生产订单, 轮次, 供应商) 唯一 —— 同一家这一轮拒了、下一轮还能再派给他。
--   * supplier_order 一张生产订单同时最多一张 ACCEPTED（部分唯一索引兜底并发接单；代码里另有生产订单行锁）。
--     退单 / 收回后旧的变 CANCELLED 留作记录，再派再接生成新的一张。
--   * supplier_price_line 归报价域：接单那一刻的对供价快照（原价、折率、单价、小计），
--     之后改折率、改原价都不影响已接的单（CLAUDE.md §10 C2）。价格不往订单域的表加列（文档 13 §3.5）。
--   * 审计上下文加 OPS_ORDER（派单阶段看图）、SUPPLIER_ORDER（接单后看图）。
--
-- 安全性：ops_order / supplier_order 此前没有任何写入路径（没有仓库、没有接口），线上必然是空表，
-- 加 NOT NULL 列不会失败；旧 jar 不读写这些列。CHECK 加值是放宽，旧 jar 不受影响。
-- 无外键（§4），关联列都建了索引。幂等：全部 IF [NOT] EXISTS；CHECK 先 DROP IF EXISTS 再加。

-- ---------- ops_order ----------
ALTER TABLE ops_order ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ASSEMBLING';
ALTER TABLE ops_order ALTER COLUMN status DROP DEFAULT;
ALTER TABLE ops_order DROP CONSTRAINT IF EXISTS ops_order_status_chk;
ALTER TABLE ops_order ADD CONSTRAINT ops_order_status_chk
    CHECK (status IN ('ASSEMBLING', 'OFFERED', 'PUBLISHED', 'ASSIGNED'));
ALTER TABLE ops_order ADD COLUMN IF NOT EXISTS dispatch_mode text;          -- 最近一次派单的派法
ALTER TABLE ops_order DROP CONSTRAINT IF EXISTS ops_order_dispatch_mode_chk;
ALTER TABLE ops_order ADD CONSTRAINT ops_order_dispatch_mode_chk
    CHECK (dispatch_mode IS NULL OR dispatch_mode IN ('TARGETED', 'MARKET'));
ALTER TABLE ops_order ADD COLUMN IF NOT EXISTS dispatch_round integer NOT NULL DEFAULT 0;
ALTER TABLE ops_order ADD COLUMN IF NOT EXISTS supplier_due_date date;      -- 对供交期，运营派单时手填
ALTER TABLE ops_order ADD COLUMN IF NOT EXISTS dispatched_at timestamptz;
ALTER TABLE ops_order DROP CONSTRAINT IF EXISTS ops_order_dispatched_chk;
ALTER TABLE ops_order ADD CONSTRAINT ops_order_dispatched_chk
    CHECK (status = 'ASSEMBLING' OR (dispatch_mode IS NOT NULL AND supplier_due_date IS NOT NULL
        AND dispatched_at IS NOT NULL AND dispatch_round > 0));
CREATE INDEX IF NOT EXISTS ops_order_status_idx ON ops_order (status);

-- ---------- ops_order_offer ----------
CREATE TABLE IF NOT EXISTS ops_order_offer (
    id              uuid        PRIMARY KEY,
    ops_order_id    uuid        NOT NULL,
    dispatch_round  integer     NOT NULL,
    supplier_org_id uuid        NOT NULL,
    status          text        NOT NULL,
    responded_at    timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    version         bigint      NOT NULL DEFAULT 0,
    CONSTRAINT ops_order_offer_status_chk CHECK (status IN ('OFFERED', 'DECLINED', 'REVOKED'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ops_order_offer_round_supplier_uk
    ON ops_order_offer (ops_order_id, dispatch_round, supplier_org_id);
CREATE INDEX IF NOT EXISTS ops_order_offer_supplier_idx ON ops_order_offer (supplier_org_id, status);

-- ---------- supplier_order ----------
ALTER TABLE supplier_order ADD COLUMN IF NOT EXISTS ops_order_id uuid NOT NULL;
ALTER TABLE supplier_order ADD COLUMN IF NOT EXISTS status text NOT NULL;
ALTER TABLE supplier_order DROP CONSTRAINT IF EXISTS supplier_order_status_chk;
ALTER TABLE supplier_order ADD CONSTRAINT supplier_order_status_chk CHECK (status IN ('ACCEPTED', 'CANCELLED'));
ALTER TABLE supplier_order ADD COLUMN IF NOT EXISTS supplier_due_date date NOT NULL;   -- 接单时的对供交期快照
ALTER TABLE supplier_order ADD COLUMN IF NOT EXISTS accepted_at timestamptz NOT NULL;
ALTER TABLE supplier_order ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE supplier_order ADD COLUMN IF NOT EXISTS cancel_reason text;
ALTER TABLE supplier_order DROP CONSTRAINT IF EXISTS supplier_order_cancel_chk;
ALTER TABLE supplier_order ADD CONSTRAINT supplier_order_cancel_chk CHECK (
    (status = 'CANCELLED' AND cancelled_at IS NOT NULL AND cancel_reason IN ('WITHDRAWN', 'REVOKED'))
    OR (status <> 'CANCELLED' AND cancelled_at IS NULL AND cancel_reason IS NULL));
CREATE INDEX IF NOT EXISTS supplier_order_ops_order_idx ON supplier_order (ops_order_id);
CREATE UNIQUE INDEX IF NOT EXISTS supplier_order_one_accepted_uk
    ON supplier_order (ops_order_id) WHERE status = 'ACCEPTED';

-- ---------- supplier_price_line（domain/quote） ----------
CREATE TABLE IF NOT EXISTS supplier_price_line (
    id                     uuid        PRIMARY KEY,
    supplier_order_id      uuid        NOT NULL,
    supplier_order_part_id uuid        NOT NULL,
    supplier_org_id        uuid        NOT NULL,
    customer_order_part_id uuid        NOT NULL,
    quantity               integer     NOT NULL,
    base_unit_price_cny    numeric(12, 2) NOT NULL,  -- 原价（客户确认的那一版报价上的）
    discount_rate          numeric(8, 4)  NOT NULL,  -- 接单时这家的折率
    unit_price_cny         numeric(12, 2) NOT NULL,  -- 对供单价 = 原价 × 折率，2 位四舍五入
    line_total_cny         numeric(14, 2) NOT NULL,  -- 小计 = 对供单价 × 数量
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    version                bigint      NOT NULL DEFAULT 0,
    CONSTRAINT supplier_price_line_quantity_positive CHECK (quantity >= 1),
    CONSTRAINT supplier_price_line_prices_positive CHECK (
        base_unit_price_cny > 0 AND discount_rate > 0 AND unit_price_cny >= 0 AND line_total_cny >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS supplier_price_line_part_uk ON supplier_price_line (supplier_order_part_id);
CREATE INDEX IF NOT EXISTS supplier_price_line_order_idx ON supplier_price_line (supplier_order_id);
CREATE INDEX IF NOT EXISTS supplier_price_line_supplier_idx ON supplier_price_line (supplier_org_id);
CREATE INDEX IF NOT EXISTS supplier_price_line_customer_part_idx ON supplier_price_line (customer_order_part_id);

-- ---------- part_file_access_log ----------
ALTER TABLE part_file_access_log DROP CONSTRAINT IF EXISTS part_file_access_log_context_chk;
ALTER TABLE part_file_access_log ADD CONSTRAINT part_file_access_log_context_chk
    CHECK ((context_type IS NULL AND context_id IS NULL)
        OR (context_type IN ('CUSTOMER_ORDER', 'OPS_ORDER', 'SUPPLIER_ORDER') AND context_id IS NOT NULL));
