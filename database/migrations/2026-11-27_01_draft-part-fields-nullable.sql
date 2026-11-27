-- 草稿订单可以存没填齐的零件（2026-11-27 拍板）：图号、名称、数量允许为空，
-- 提交订单时由服务端检查是否填齐（CustomerOrderService.submit）。
-- 数量「>= 1」的 CHECK 保留：值为空时 CHECK 不触发，填了就必须是正数。
--
-- 发布注意：上一版代码把数量映射成 int，回滚到上一版后，读到数量为空的草稿会报错、打不开那张订单。
-- 2026-11-27 已确认接受这个回滚风险，不拆两次发布。
ALTER TABLE customer_order_part ALTER COLUMN part_no DROP NOT NULL;
ALTER TABLE customer_order_part ALTER COLUMN part_name DROP NOT NULL;
ALTER TABLE customer_order_part ALTER COLUMN quantity DROP NOT NULL;
ALTER TABLE part_design ALTER COLUMN code DROP NOT NULL;
ALTER TABLE part_design ALTER COLUMN name DROP NOT NULL;
