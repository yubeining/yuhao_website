-- 客户侧的三个参考编号。
--
-- 依据：设计文档 9 §2 §5。这三列是逐列核对一份真实客户清单（58 行 / 57 个图号）
-- 得出的，不是推演出来的。
--
-- ★ 我方一个字都不用它们计算。存它们唯一的理由是客户要拿我方单据
--   回去对他自己的账 —— 报价单上没有他的任务编号，他就对不上。
--
-- ★ 三列全部可空、不加唯一约束、不做格式校验。编号规则是客户定的，
--   换个客户就变。任何「必须几位」「必须唯一」的假设都会在第二个客户那里炸。
--
-- 本迁移只加可空列和索引，v1 的代码面对它能正常跑（CLAUDE.md §5 扩展-收缩）。

-- ── 系统号 / 课题号：零件固有属性 ───────────────────────────────────
-- 判据：57 个图号里 56 个恒定对应同一组（系统号，课题号）；
-- 唯一的例外只是分属两个批次，这两个编号完全一样。
ALTER TABLE part ADD COLUMN IF NOT EXISTS customer_system_no text;
ALTER TABLE part ADD COLUMN IF NOT EXISTS customer_topic_no  text;

COMMENT ON COLUMN part.customer_system_no IS 'customer system number, opaque, never parsed';
COMMENT ON COLUMN part.customer_topic_no  IS 'customer topic number, opaque, never parsed';

-- ── 任务编号：批次，不是零件属性 ─────────────────────────────────────
-- 判据：同一个图号可以出现在两个批次里（样本里有一例）。
ALTER TABLE rfq_item ADD COLUMN IF NOT EXISTS customer_task_no text;

COMMENT ON COLUMN rfq_item.customer_task_no IS 'customer task/batch number, opaque, never parsed';

-- ── 索引 ────────────────────────────────────────────────────────────
-- 客户拿这三个编号反查是最高频的查询路径。
-- 本系统不建外键，所以没有任何东西会替你建索引（CLAUDE.md §4）。
-- 部分索引：绝大多数行这三列为空，不进索引省一半空间。
CREATE INDEX IF NOT EXISTS idx_part_customer_system_no
    ON part (customer_party_id, customer_system_no)
    WHERE customer_system_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_part_customer_topic_no
    ON part (customer_party_id, customer_topic_no)
    WHERE customer_topic_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rfq_item_customer_task_no
    ON rfq_item (customer_task_no)
    WHERE customer_task_no IS NOT NULL;
