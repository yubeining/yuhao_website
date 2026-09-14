-- 客户订单：草稿 → 加零件 → 提交（2026-09-14 对话决策，设计文档 11 §4 第 2 步），
-- 外加第 1 步评审后必须补的图纸版本锁定、审计上下文。
--
-- 已拍板（2026-09-14，需求方当面）：
--   * 提交条件：每行必须有图号 + 名称 + 数量 + 至少一份传完且校验通过的图纸。
--   * 客户还填：材料 / 表面处理（自由文本，可选）、订单名称、期望交期（仅参考，不是运营填的交期）。
--   * 图纸版本在订单提交时锁定；同一图号再次下单默认沿用上次锁定的版本，换图就开新版本。
--
-- 设计要点：
--   * 订单状态只建现在用得到的三个。报价 / 确认等状态随第 3 步加 —— 枚举加值是安全的。
--   * customer_order_part.part_revision_id 是订单行锁定的图纸版本（CLAUDE.md §3 铁律 7），不是父零件 id。
--   * part_name 是订单行上的快照：草稿里改名只改这一行，不回写零件主数据，
--     否则改一次名，历史订单的显示就跟着变（CLAUDE.md §10 C2）。
--   * material / surface_treatment 放订单行上，不放图纸版本上：改材料不应该逼出一个新版本。
--   * customer_org_id 冗余到订单行，租户条件直接进查询（§3 铁律 2），和第 1 步三张表一致。
--   * part_revision.locked_at 非空 = 已被提交的订单引用，之后不许再往这一版加 / 删文件。
--   * part_file 加 REMOVED：草稿里删图纸只改状态，行留着 —— 它可能已经有审计记录指向它。
--   * 审计加上下文：在哪张订单里看的图。
--
-- 安全性：customer_order / customer_order_part 至今没有任何写入路径（无 Repository、无 Service），
-- 线上必然是空表，加 NOT NULL 列不会失败；其余都是可空列或枚举加值。线上旧 jar 不读写这些列。
-- 无外键（§4）。幂等：全部 IF [NOT] EXISTS；CHECK 约束先 DROP IF EXISTS 再加。

-- ---------- customer_order ----------
ALTER TABLE customer_order ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'DRAFT';
ALTER TABLE customer_order ALTER COLUMN status DROP DEFAULT;
ALTER TABLE customer_order DROP CONSTRAINT IF EXISTS customer_order_status_chk;
ALTER TABLE customer_order ADD CONSTRAINT customer_order_status_chk
    CHECK (status IN ('DRAFT', 'SUBMITTED', 'CANCELLED'));

ALTER TABLE customer_order ADD COLUMN IF NOT EXISTS title text;             -- 客户给订单起的名字
ALTER TABLE customer_order ADD COLUMN IF NOT EXISTS wanted_lead_days integer; -- 客户期望的交货天数，仅参考
ALTER TABLE customer_order DROP CONSTRAINT IF EXISTS customer_order_wanted_lead_days_positive;
ALTER TABLE customer_order ADD CONSTRAINT customer_order_wanted_lead_days_positive
    CHECK (wanted_lead_days IS NULL OR wanted_lead_days > 0);
ALTER TABLE customer_order ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

-- ---------- customer_order_part ----------
ALTER TABLE customer_order_part ADD COLUMN IF NOT EXISTS customer_org_id uuid NOT NULL;
ALTER TABLE customer_order_part ADD COLUMN IF NOT EXISTS part_revision_id uuid NOT NULL;
ALTER TABLE customer_order_part ADD COLUMN IF NOT EXISTS part_name text NOT NULL;
ALTER TABLE customer_order_part ADD COLUMN IF NOT EXISTS material text;
ALTER TABLE customer_order_part ADD COLUMN IF NOT EXISTS surface_treatment text;
CREATE INDEX IF NOT EXISTS customer_order_part_revision_idx ON customer_order_part (part_revision_id);
CREATE INDEX IF NOT EXISTS customer_order_part_customer_idx ON customer_order_part (customer_org_id);

-- ---------- part_revision ----------
ALTER TABLE part_revision ADD COLUMN IF NOT EXISTS locked_at timestamptz;   -- 非空 = 已被提交的订单锁定

-- ---------- part_file ----------
ALTER TABLE part_file DROP CONSTRAINT IF EXISTS part_file_upload_status_chk;
ALTER TABLE part_file ADD CONSTRAINT part_file_upload_status_chk
    CHECK (upload_status IN ('PENDING', 'COMPLETED', 'REJECTED', 'REMOVED'));

-- ---------- part_file_access_log ----------
ALTER TABLE part_file_access_log ADD COLUMN IF NOT EXISTS context_type text;
ALTER TABLE part_file_access_log ADD COLUMN IF NOT EXISTS context_id uuid;
ALTER TABLE part_file_access_log DROP CONSTRAINT IF EXISTS part_file_access_log_context_chk;
ALTER TABLE part_file_access_log ADD CONSTRAINT part_file_access_log_context_chk
    CHECK ((context_type IS NULL AND context_id IS NULL)
        OR (context_type IN ('CUSTOMER_ORDER') AND context_id IS NOT NULL));
