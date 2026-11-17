-- AI 成本估算（基准价，设计文档 8 / 13 §2 的「基准价」）：费率表 + 每次估算的快照。
--
-- 2026-11-17 需求方拍板：AI 只估成本、不加毛利；运营点按钮才估；AI 给建议、人工确认原价；
-- 第一版只估机加件。算法与费率取自《昱昊机械 · 报价逻辑与方法手册》2026-11-15 版：
-- 费率是区间的取中间值（需求方 2026-11-17 定），原文写在 note 里。
--
-- 两张表都归 domain/quote（报价域）。只加表、加枚举值，旧版本代码不受影响，无需扩展-收缩。

-- ---------- cost_rate：费率表，运营在后台维护 ----------
CREATE TABLE IF NOT EXISTS cost_rate (
    id              uuid PRIMARY KEY,
    kind            text NOT NULL,
    name            text NOT NULL,
    unit            text NOT NULL,
    unit_price_cny  numeric(12,2) NOT NULL,
    note            text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    version         bigint NOT NULL DEFAULT 0,
    CONSTRAINT cost_rate_kind_chk CHECK (kind IN ('MATERIAL', 'PROCESS', 'OUTSOURCE')),
    CONSTRAINT cost_rate_unit_chk CHECK (unit IN ('KG', 'HOUR', 'PIECE', 'BATCH')),
    CONSTRAINT cost_rate_price_positive CHECK (unit_price_cny > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS cost_rate_kind_name_uk ON cost_rate (kind, name);

-- 初始值：手册第二章里有人民币数字的条目。「按件核算 / 按批量 / 按面积」和欧元计价的条目没有可用数字，不填。
INSERT INTO cost_rate (id, kind, name, unit, unit_price_cny, note) VALUES
    (gen_random_uuid(), 'MATERIAL', '碳钢板/棒（16MnCr5 类）', 'KG', 9.00, '手册 2.2'),
    (gen_random_uuid(), 'MATERIAL', '17CrNiMo6 棒/板', 'KG', 14.00, '手册 2.2'),
    (gen_random_uuid(), 'MATERIAL', 'ERW 黑管 3/4"–1" Sch40', 'KG', 4.60, '手册 2.2'),
    (gen_random_uuid(), 'MATERIAL', 'POM-C 棒', 'KG', 29.50, '手册 2.2：29–30 取中值'),
    (gen_random_uuid(), 'MATERIAL', '1.4541（12Х18Н9Т）不锈钢', 'KG', 35.00, '手册 2.2：按形态 25–45 取中值；锻件另计'),
    (gen_random_uuid(), 'MATERIAL', '17-4PH / 双相钢锻件', 'KG', 30.00, '手册 2.2'),
    (gen_random_uuid(), 'MATERIAL', 'GH3536 / Hastelloy X 板（认证小批量）', 'KG', 330.00, '手册 2.2'),
    (gen_random_uuid(), 'MATERIAL', 'Hastelloy X 焊丝', 'KG', 700.00, '手册 2.2'),
    (gen_random_uuid(), 'PROCESS', '数控车', 'HOUR', 130.00, '手册 2.3：110–150 取中值'),
    (gen_random_uuid(), 'PROCESS', '数控铣（三轴）', 'HOUR', 140.00, '手册 2.3：130–150 取中值'),
    (gen_random_uuid(), 'PROCESS', '五轴铣（外协伙伴）', 'HOUR', 200.00, '手册 2.3'),
    (gen_random_uuid(), 'PROCESS', '激光切割（板材，N₂）', 'HOUR', 180.00, '手册 2.3'),
    (gen_random_uuid(), 'PROCESS', '五轴激光打孔', 'HOUR', 260.00, '手册 2.3'),
    (gen_random_uuid(), 'PROCESS', '成形（卷圆/冲压）', 'HOUR', 120.00, '手册 2.3'),
    (gen_random_uuid(), 'PROCESS', '装配定位焊 + TIG（背保护）', 'HOUR', 160.00, '手册 2.3'),
    (gen_random_uuid(), 'PROCESS', '焊后打磨/酸洗钝化', 'HOUR', 100.00, '手册 2.3'),
    (gen_random_uuid(), 'PROCESS', '磨削（外圆/平面）', 'HOUR', 165.00, '手册 2.3：150–180 取中值'),
    (gen_random_uuid(), 'PROCESS', '检验（CMM/过程+终检）', 'HOUR', 160.00, '手册 2.3'),
    (gen_random_uuid(), 'PROCESS', '清理/打标/包装准备', 'HOUR', 100.00, '手册 2.3'),
    (gen_random_uuid(), 'PROCESS', '弯管（液压，半自动）', 'PIECE', 2.60, '手册 2.3：节拍 90s/件'),
    (gen_random_uuid(), 'PROCESS', '弯管（CNC 芯棒，自动）', 'PIECE', 1.75, '手册 2.3：节拍 45s/件'),
    (gen_random_uuid(), 'PROCESS', '滚丝（NPT，批量）', 'PIECE', 0.76, '手册 2.3：20s/端 + 模具摊销'),
    (gen_random_uuid(), 'PROCESS', '车丝（NPT，小批量）', 'PIECE', 1.00, '手册 2.3：60s/两端'),
    (gen_random_uuid(), 'PROCESS', '硬铣/坐标磨（热后位置孔）', 'PIECE', 200.00, '手册 2.3：150–250/件 取中值'),
    (gen_random_uuid(), 'OUTSOURCE', '热镀锌（成形后整镀）', 'KG', 2.20, '手册 2.4：2.0–2.4 取中值，小批量上浮'),
    (gen_random_uuid(), 'OUTSOURCE', '渗碳淬火（EHT 1.5–2mm，HRC57 级，含校直）', 'PIECE', 395.00, '手册 2.4：360–430 取中值'),
    (gen_random_uuid(), 'OUTSOURCE', '气体渗氮+后氧化（20kg 级件）', 'PIECE', 465.00, '手册 2.4：440–490 取中值'),
    (gen_random_uuid(), 'OUTSOURCE', 'QPQ 盐浴氮碳共渗+氧化+封闭', 'PIECE', 220.00, '手册 2.4：180–260 取中值'),
    (gen_random_uuid(), 'OUTSOURCE', '固溶热处理（真空/H₂，~1175℃）', 'PIECE', 2200.00, '手册 2.4'),
    (gen_random_uuid(), 'OUTSOURCE', '搪瓷涂层（双面，掩孔）', 'PIECE', 2600.00, '手册 2.4'),
    (gen_random_uuid(), 'OUTSOURCE', 'FPI 100%（EN 571-1，ISO 9712 L2）', 'PIECE', 700.00, '手册 2.4'),
    (gen_random_uuid(), 'OUTSOURCE', '流量试验', 'PIECE', 500.00, '手册 2.4'),
    (gen_random_uuid(), 'OUTSOURCE', '去应力热处理（随炉试环）', 'BATCH', 10000.00, '手册 2.4：/炉次'),
    (gen_random_uuid(), 'OUTSOURCE', '超速试验', 'PIECE', 30000.00, '手册 2.4：/次（叶轮单件）'),
    (gen_random_uuid(), 'OUTSOURCE', '双面动平衡', 'PIECE', 6000.00, '手册 2.4'),
    (gen_random_uuid(), 'OUTSOURCE', 'PT 全表面两道', 'PIECE', 8000.00, '手册 2.4'),
    (gen_random_uuid(), 'OUTSOURCE', 'MT + 退磁', 'PIECE', 8000.00, '手册 2.4')
ON CONFLICT (kind, name) DO NOTHING;

-- ---------- price_estimate：每次估算留一行，不改不删 ----------
-- 计算用到的费率、数量系数、AI 原始输出全部快照进来（CLAUDE.md §10 C2）：之后改费率不影响已有的估算。
CREATE TABLE IF NOT EXISTS price_estimate (
    id                      uuid PRIMARY KEY,
    customer_order_id       uuid NOT NULL,
    customer_order_part_id  uuid NOT NULL,
    customer_org_id         uuid NOT NULL,
    outcome                 text NOT NULL,
    unit_cost_cny           numeric(12,2),
    complete                boolean NOT NULL,
    input_snapshot          jsonb NOT NULL,
    ai_output               jsonb NOT NULL,
    breakdown               jsonb NOT NULL,
    model                   text NOT NULL,
    estimated_by            uuid NOT NULL,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    version                 bigint NOT NULL DEFAULT 0,
    CONSTRAINT price_estimate_outcome_chk CHECK (outcome IN ('ESTIMATED', 'NOT_MACHINED'))
);
CREATE INDEX IF NOT EXISTS price_estimate_line_idx ON price_estimate (customer_order_part_id, created_at DESC);
CREATE INDEX IF NOT EXISTS price_estimate_order_idx ON price_estimate (customer_order_id);

-- ---------- part_file_access_log：读图纸给 AI 也要审计（CLAUDE.md §3 铁律 6） ----------
ALTER TABLE part_file_access_log DROP CONSTRAINT IF EXISTS part_file_access_log_access_type_chk;
ALTER TABLE part_file_access_log ADD CONSTRAINT part_file_access_log_access_type_chk
    CHECK (access_type IN ('SIGNED_URL_ISSUED', 'READ_FOR_AI'));
