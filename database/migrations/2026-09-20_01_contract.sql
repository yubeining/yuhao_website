-- 合同：运营建合同 → 供应商签字锁定（设计文档 12 §4，2026-09-20 需求方拍板）。
--
-- 已拍板（2026-09-20）：
--   * 本轮只做交互和签字，**不生成 PDF、不写条款正文**。合同页先只展示系统里已有的数据
--     （双方名称、零件明细、单价 / 小计 / 合计、交期）；备注、付款条件、条款正文等定了再加。
--   * **超时 7 天，从供应商接单那一刻算起**（不是从建合同算）。到点还没签字：供应商订单自动取消，
--     生产订单回组装中，运营重派（和 2026-09-09 定的「签字超时自动回待派单」一致）。
--   * 签字前双方都能退：供应商退单、运营收回；签字之后锁定，不能退也不能改（文档 12 §4）。
--
-- 设计要点：
--   * 合同没有自己的内容字段，就是供应商订单上的几个时间戳 + 状态，所以**不单开一张表**。
--     等条款正文 / 附件 / 付款条件定下来，再按文档 12 §10 拆成合同域自己的表。
--   * 状态加两个值（枚举加值是安全的）：ACCEPTED → CONTRACT_PENDING → CONTRACTED。
--     取消原因加 SIGN_TIMEOUT（超时自动取消）。
--   * 「签不签得了」靠状态判断，不靠时间：定时任务把超时的改成已取消，页面看到的就是取消。
--
-- 只加列和枚举值，旧 jar 不受影响。无外键（§4）。幂等：全部 IF NOT EXISTS；CHECK 先 DROP IF EXISTS 再加。

ALTER TABLE supplier_order ADD COLUMN IF NOT EXISTS contract_created_at timestamptz;
ALTER TABLE supplier_order ADD COLUMN IF NOT EXISTS contract_created_by_user_id uuid;
ALTER TABLE supplier_order ADD COLUMN IF NOT EXISTS signed_at timestamptz;
ALTER TABLE supplier_order ADD COLUMN IF NOT EXISTS signed_by_user_id uuid;

ALTER TABLE supplier_order DROP CONSTRAINT IF EXISTS supplier_order_status_chk;
ALTER TABLE supplier_order ADD CONSTRAINT supplier_order_status_chk
    CHECK (status IN ('ACCEPTED', 'CONTRACT_PENDING', 'CONTRACTED', 'CANCELLED'));

ALTER TABLE supplier_order DROP CONSTRAINT IF EXISTS supplier_order_cancel_chk;
ALTER TABLE supplier_order ADD CONSTRAINT supplier_order_cancel_chk CHECK (
    (status = 'CANCELLED' AND cancelled_at IS NOT NULL
        AND cancel_reason IN ('WITHDRAWN', 'REVOKED', 'SIGN_TIMEOUT'))
    OR (status <> 'CANCELLED' AND cancelled_at IS NULL AND cancel_reason IS NULL));

-- 待签 / 已签必须有对应的时间戳；已签必然先有过合同
ALTER TABLE supplier_order DROP CONSTRAINT IF EXISTS supplier_order_contract_chk;
ALTER TABLE supplier_order ADD CONSTRAINT supplier_order_contract_chk CHECK (
    (status <> 'CONTRACT_PENDING' OR (contract_created_at IS NOT NULL AND signed_at IS NULL))
    AND (status <> 'CONTRACTED' OR (contract_created_at IS NOT NULL AND signed_at IS NOT NULL
        AND signed_by_user_id IS NOT NULL)));

-- 「一张生产订单同时最多一张在手的供应商订单」：已接 / 待签 / 已签都算在手（原来只算已接）
DROP INDEX IF EXISTS supplier_order_one_accepted_uk;
CREATE UNIQUE INDEX IF NOT EXISTS supplier_order_one_active_uk
    ON supplier_order (ops_order_id) WHERE status <> 'CANCELLED';

-- 超时扫描按「接单时间 + 状态」找，给它一个索引
CREATE INDEX IF NOT EXISTS supplier_order_status_accepted_at_idx ON supplier_order (status, accepted_at);
