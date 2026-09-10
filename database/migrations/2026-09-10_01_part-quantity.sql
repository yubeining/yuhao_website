-- 三张零件实例表加 quantity —— 一行零件 = 一批,不是一个物理件(2026-09-10 对话决策)。
--
-- 背景:文档 1 定义零件行是「图纸 + 材料 + 工艺 + 公差 + 表面处理 + 数量 + 交期」,
-- D3/D12 又拍板「同一零件的数量可以拆给多家」。但 2026-09-08_05 的骨架表漏了数量,
-- 而设计文档 12 初稿全篇按「一行 = 一个件」写(「数量」出现 0 次)。两边都要改,这是库这边。
--
-- 语义(设计文档 12 §1「每一行零件都带数量」):
--   * 质检按个数记(合格 N / 返工 N / 报废 N),不逐件建行、不发序列号。
--   * 部分返工 = 原行数量减去问题件数 + 另开一行装那几件;两行数量之和不变。
--   * 派单必须一次派完:各供应商分配数量之和 = 客户零件行总数量(文档 1 核心不变式,已由 ≤ 改为 =)。
--
-- 为什么先给默认值再 DROP DEFAULT:
--   给默认值是为了让 NOT NULL 能加上(万一有存量行);随即撤掉默认值,
--   这样以后【忘了填数量会当场报错】,而不是静默变成 1 ——
--   数量是要拿去算钱和排产的,静默默认值是最难查的那种错。
--
-- 安全性:这三张表目前【没有任何写入路径】(domain/order 下只有实体,无 repository/service,
-- 全仓库零引用),所以不存在存量行,旧版本 jar 面对新 schema 也不会因为多一列而写不进去。
-- 一次发布即可,不需要扩展-收缩。
--
-- 幂等:全部 IF NOT EXISTS / IF EXISTS。

ALTER TABLE customer_order_part ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;
ALTER TABLE customer_order_part ALTER COLUMN quantity DROP DEFAULT;
ALTER TABLE customer_order_part DROP CONSTRAINT IF EXISTS customer_order_part_quantity_positive;
ALTER TABLE customer_order_part ADD CONSTRAINT customer_order_part_quantity_positive CHECK (quantity >= 1);

ALTER TABLE ops_order_part ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;
ALTER TABLE ops_order_part ALTER COLUMN quantity DROP DEFAULT;
ALTER TABLE ops_order_part DROP CONSTRAINT IF EXISTS ops_order_part_quantity_positive;
ALTER TABLE ops_order_part ADD CONSTRAINT ops_order_part_quantity_positive CHECK (quantity >= 1);

ALTER TABLE supplier_order_part ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;
ALTER TABLE supplier_order_part ALTER COLUMN quantity DROP DEFAULT;
ALTER TABLE supplier_order_part DROP CONSTRAINT IF EXISTS supplier_order_part_quantity_positive;
ALTER TABLE supplier_order_part ADD CONSTRAINT supplier_order_part_quantity_positive CHECK (quantity >= 1);
