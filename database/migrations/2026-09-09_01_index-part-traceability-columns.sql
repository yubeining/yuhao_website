-- 给零件溯源列补索引。
--
-- 起因：这四列是 2026-09-08_05 里【刻意冗余】出来的，那份迁移的注释原话是
-- 「冗余 source_customer_order_id / source_customer_id(创建时快照,查着快)」——
-- 但当时没建索引，于是「查着快」这个唯一的存在理由并没有兑现：
-- 按源客户或源客户订单反查零件，走的是全表扫。
--
-- 为什么会漏：CLAUDE.md §4 禁止数据库外键，关联全是裸 uuid 列。
-- 别的项目里外键会顺带带来索引，这里不会 —— 规范里那句
-- 「必须显式建索引 —— 这些列全是 join / filter 主力，而没有外键就没人替你建」
-- 说的就是这种情况。加列的时候不同时加索引，就没有任何东西会提醒你。
--
-- 只补溯源这四列。customer_order.created_by_user_id / ops_order.created_by_user_id /
-- supplier_order.accepted_by_user_id 同样没有索引，但那是归属留痕，
-- 没有任何设计说它们会被当查询条件用；索引不是免费的（每次写入都要维护），
-- 没有依据就不建。等真出现「按操作人筛订单」的需求再补。
--
-- 不用 CREATE INDEX CONCURRENTLY：迁移执行器按文件包事务，而 CONCURRENTLY
-- 不能在事务里跑。当前这几张表是空的，普通 CREATE INDEX 瞬间完成。
-- 将来表大了要加索引，单独走一次运维操作，不要塞进迁移。

CREATE INDEX IF NOT EXISTS ops_order_part_source_customer_order_idx
    ON ops_order_part (source_customer_order_id);
CREATE INDEX IF NOT EXISTS ops_order_part_source_customer_idx
    ON ops_order_part (source_customer_id);

CREATE INDEX IF NOT EXISTS supplier_order_part_source_customer_order_idx
    ON supplier_order_part (source_customer_order_id);
CREATE INDEX IF NOT EXISTS supplier_order_part_source_customer_idx
    ON supplier_order_part (source_customer_id);
