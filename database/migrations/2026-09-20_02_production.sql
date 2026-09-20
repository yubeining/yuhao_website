-- 生产进度 + 质检（设计文档 12 §1 §5 §7 §8，2026-09-20 需求方拍板）。
--
-- 已拍板（2026-09-20）：
--   * 本轮做到**质检完成**为止。发给客户（物流单号、客户确认收货）下一轮。
--   * 报工只有两个动作：**开工**和**完工**，不报件数（供应商不逐件报进度）。
--   * **整单全部完工才能发给平台**（和「整单一次发齐」一致）。
--   * 质检按**件数**记：合格 N / 返工 M / 报废 K，三个数之和必须等于该行件数。
--   * 报废补料本轮只做**原厂重做**（同一家、不加钱）；「换一家做」和差价扣款下一轮。
--
-- 设计要点：
--   * **叶子行（supplier_order_part）是唯一的真状态机**（文档 12 §1）。上面两层的零件行不存供应侧状态：
--     运营页面按叶子行现算；客户零件行只存折叠过的四态（下面单独说）。
--   * 部分返工 / 部分报废 = **拆行**：原行留下合格件数，问题件另开一行（同一张供应商订单）。
--     溯源两头都记：旧行 superseded_by → 新行，新行 replaces_part_id → 旧行。
--     原行合格 0 件时**件数不动**、状态改 SUPERSEDED —— quantity 的 CHECK 是 >= 1，减不到 0；
--     被替代的行不计入活跃件数。
--     数量守恒：同一客户零件行下「活跃行件数 + 还没补料的报废件数 = 客户要的件数」。
--   * **客户只看得到四态**（PENDING / IN_PROGRESS / FULFILLED / CANCELLED，文档 12 §7）：
--     返工、报废、供应商侧取消一律折成「进行中」，客户看不到也不该看到供应侧的波折。
--     这一列由叶子行在**同一个事务里**回写（文档 12 §8），不是运行时 join 算出来的。
--   * 价格快照（supplier_price_line）一行都不动：返工 / 重做是供应商自担成本，新行没有价格行。
--
-- 只加列和枚举值，旧 jar 不受影响（新列可空或带默认值）。无外键（§4），新关联列显式建索引。
-- 幂等：全部 IF NOT EXISTS；CHECK 先 DROP IF EXISTS 再加。

-- ---------- 叶子零件行：真状态机 ----------

ALTER TABLE supplier_order_part ADD COLUMN IF NOT EXISTS fulfillment_status text NOT NULL DEFAULT 'PENDING';
ALTER TABLE supplier_order_part ADD COLUMN IF NOT EXISTS superseded_by uuid;
ALTER TABLE supplier_order_part ADD COLUMN IF NOT EXISTS replaces_part_id uuid;
ALTER TABLE supplier_order_part ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE supplier_order_part ADD COLUMN IF NOT EXISTS produced_at timestamptz;
ALTER TABLE supplier_order_part ADD COLUMN IF NOT EXISTS shipped_at timestamptz;
ALTER TABLE supplier_order_part ADD COLUMN IF NOT EXISTS qc_decided_at timestamptz;

ALTER TABLE supplier_order_part DROP CONSTRAINT IF EXISTS supplier_order_part_status_chk;
ALTER TABLE supplier_order_part ADD CONSTRAINT supplier_order_part_status_chk CHECK (
    fulfillment_status IN ('PENDING', 'IN_PRODUCTION', 'PRODUCED', 'QC_PENDING', 'QC_PASSED',
                           'SUPERSEDED', 'SCRAPPED', 'CANCELLED'));

-- 每一步都必须留下时间，事后查得出「什么时候开的工 / 什么时候判的」
ALTER TABLE supplier_order_part DROP CONSTRAINT IF EXISTS supplier_order_part_timeline_chk;
ALTER TABLE supplier_order_part ADD CONSTRAINT supplier_order_part_timeline_chk CHECK (
    (fulfillment_status <> 'IN_PRODUCTION' OR started_at IS NOT NULL)
    AND (fulfillment_status NOT IN ('PRODUCED', 'QC_PENDING', 'QC_PASSED') OR produced_at IS NOT NULL)
    AND (fulfillment_status NOT IN ('QC_PENDING', 'QC_PASSED') OR shipped_at IS NOT NULL)
    AND (fulfillment_status NOT IN ('QC_PASSED', 'SCRAPPED') OR qc_decided_at IS NOT NULL));

-- 被替代的行必须指得出替代它的新行，否则件数就凭空少了一批
ALTER TABLE supplier_order_part DROP CONSTRAINT IF EXISTS supplier_order_part_superseded_chk;
ALTER TABLE supplier_order_part ADD CONSTRAINT supplier_order_part_superseded_chk CHECK (
    fulfillment_status <> 'SUPERSEDED' OR superseded_by IS NOT NULL);

CREATE INDEX IF NOT EXISTS supplier_order_part_order_status_idx
    ON supplier_order_part (supplier_order_id, fulfillment_status);
CREATE INDEX IF NOT EXISTS supplier_order_part_superseded_by_idx ON supplier_order_part (superseded_by);
CREATE INDEX IF NOT EXISTS supplier_order_part_replaces_idx ON supplier_order_part (replaces_part_id);

-- ---------- 客户零件行：折叠过的四态 ----------

ALTER TABLE customer_order_part ADD COLUMN IF NOT EXISTS fulfillment_status text NOT NULL DEFAULT 'PENDING';

ALTER TABLE customer_order_part DROP CONSTRAINT IF EXISTS customer_order_part_fulfillment_chk;
ALTER TABLE customer_order_part ADD CONSTRAINT customer_order_part_fulfillment_chk CHECK (
    fulfillment_status IN ('PENDING', 'IN_PROGRESS', 'FULFILLED', 'CANCELLED'));

-- ---------- 三张单的状态加值（加值对旧 jar 安全） ----------

ALTER TABLE supplier_order DROP CONSTRAINT IF EXISTS supplier_order_status_chk;
ALTER TABLE supplier_order ADD CONSTRAINT supplier_order_status_chk CHECK (
    status IN ('ACCEPTED', 'CONTRACT_PENDING', 'CONTRACTED', 'IN_PRODUCTION', 'SHIPPED', 'FULFILLED', 'CANCELLED'));

-- 生产中 / 已发 / 已完成都在签字之后，一样必须有合同和签字记录
ALTER TABLE supplier_order DROP CONSTRAINT IF EXISTS supplier_order_contract_chk;
ALTER TABLE supplier_order ADD CONSTRAINT supplier_order_contract_chk CHECK (
    (status <> 'CONTRACT_PENDING' OR (contract_created_at IS NOT NULL AND signed_at IS NULL))
    AND (status NOT IN ('CONTRACTED', 'IN_PRODUCTION', 'SHIPPED', 'FULFILLED')
        OR (contract_created_at IS NOT NULL AND signed_at IS NOT NULL AND signed_by_user_id IS NOT NULL)));

ALTER TABLE ops_order DROP CONSTRAINT IF EXISTS ops_order_status_chk;
ALTER TABLE ops_order ADD CONSTRAINT ops_order_status_chk CHECK (
    status IN ('ASSEMBLING', 'OFFERED', 'PUBLISHED', 'ASSIGNED', 'FULFILLED'));

-- READY = 零件全部质检合格，等发给客户（发货那一轮再往下走）
ALTER TABLE customer_order DROP CONSTRAINT IF EXISTS customer_order_status_chk;
ALTER TABLE customer_order ADD CONSTRAINT customer_order_status_chk CHECK (
    status IN ('DRAFT', 'SUBMITTED', 'QUOTED', 'CONFIRMED', 'READY', 'CANCELLED'));
