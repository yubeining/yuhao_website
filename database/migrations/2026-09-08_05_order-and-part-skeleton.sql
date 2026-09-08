-- 订单 + 零件 的【基础骨架表】—— 业务表第一批(2026-09-08 对话决策)。
--
-- 只建骨架:归属 / 关联 / 唯一编号 / 溯源。状态流转、图纸/文件、数量/材料/工艺/规格、
-- 价格、时间、人类可读编号、part_no 生成规则 —— 后续再往上加列(那时走新迁移)。
--
-- 关键设计:
--   * 订单三个域各一张表(客户建 / 运营组装 / 供应商接),互不直连。
--   * 订单之间的多对多 + 溯源,靠【零件派生链】:下游零件实例存 upstream_part_id 指上游零件实例,
--     并冗余 source_customer_order_id / source_customer_id(创建时快照,查着快)。
--   * 零件两层:part_design(同一种零件,归某客户)+ 三张零件实例表(各有 part_no 唯一编号)。
--   * 无外键(§4):全裸 uuid + 显式索引,完整性/溯源在 service 层。继承 BaseEntity 的表带 version。

-- ============================================================
-- 订单(3 张,独立域)
-- ============================================================
CREATE TABLE IF NOT EXISTS customer_order (
    id                 uuid PRIMARY KEY,
    customer_org_id    uuid        NOT NULL,   -- 客户组织(租户)
    created_by_user_id uuid,                   -- 下单的客户用户
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    version            bigint      NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS customer_order_org_idx ON customer_order (customer_org_id);

CREATE TABLE IF NOT EXISTS ops_order (
    id                 uuid PRIMARY KEY,
    created_by_user_id uuid,                   -- 组装该订单的运营用户
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    version            bigint      NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS supplier_order (
    id                  uuid PRIMARY KEY,
    supplier_org_id     uuid        NOT NULL,  -- 供应商组织(租户)
    accepted_by_user_id uuid,                  -- 接单的供应商用户
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    version             bigint      NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS supplier_order_org_idx ON supplier_order (supplier_org_id);

-- ============================================================
-- 零件设计模板(1 张,归某客户 —— "同一种零件")
-- ============================================================
CREATE TABLE IF NOT EXISTS part_design (
    id              uuid PRIMARY KEY,
    customer_org_id uuid        NOT NULL,      -- 归属客户(租户隔离,别的客户看不到)
    code            text        NOT NULL,      -- 该客户内唯一的设计编码
    name            text        NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    version         bigint      NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS part_design_customer_code_uk ON part_design (customer_org_id, code);
CREATE INDEX IF NOT EXISTS part_design_customer_idx ON part_design (customer_org_id);

-- ============================================================
-- 零件实例(3 张,和订单一一对应;各有 part_no 唯一编号,指回 part_design)
--   part_no 目前按【表内唯一】;真正的全局唯一由后续的编号生成规则保证。
-- ============================================================
CREATE TABLE IF NOT EXISTS customer_order_part (
    id                uuid PRIMARY KEY,
    customer_order_id uuid        NOT NULL,    -- 所属客户订单
    part_design_id    uuid        NOT NULL,    -- 是哪一种零件
    part_no           text        NOT NULL,    -- 唯一编号(溯源根)
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    version           bigint      NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_order_part_no_uk ON customer_order_part (part_no);
CREATE INDEX IF NOT EXISTS customer_order_part_order_idx  ON customer_order_part (customer_order_id);
CREATE INDEX IF NOT EXISTS customer_order_part_design_idx ON customer_order_part (part_design_id);

CREATE TABLE IF NOT EXISTS ops_order_part (
    id                      uuid PRIMARY KEY,
    ops_order_id            uuid        NOT NULL,   -- 所属运营订单
    part_design_id          uuid        NOT NULL,
    part_no                 text        NOT NULL,
    upstream_part_id        uuid        NOT NULL,   -- 派生自哪个 customer_order_part
    source_customer_order_id uuid       NOT NULL,   -- 溯源快照:源客户订单
    source_customer_id      uuid        NOT NULL,   -- 溯源快照:源客户
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    version                 bigint      NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS ops_order_part_no_uk ON ops_order_part (part_no);
CREATE INDEX IF NOT EXISTS ops_order_part_order_idx    ON ops_order_part (ops_order_id);
CREATE INDEX IF NOT EXISTS ops_order_part_design_idx   ON ops_order_part (part_design_id);
CREATE INDEX IF NOT EXISTS ops_order_part_upstream_idx ON ops_order_part (upstream_part_id);

CREATE TABLE IF NOT EXISTS supplier_order_part (
    id                       uuid PRIMARY KEY,
    supplier_order_id        uuid        NOT NULL,  -- 所属供应商订单
    part_design_id           uuid        NOT NULL,
    part_no                  text        NOT NULL,
    upstream_part_id         uuid        NOT NULL,  -- 派生自哪个 ops_order_part
    source_customer_order_id uuid        NOT NULL,  -- 溯源快照:源客户订单
    source_customer_id       uuid        NOT NULL,  -- 溯源快照:源客户
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    version                  bigint      NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS supplier_order_part_no_uk ON supplier_order_part (part_no);
CREATE INDEX IF NOT EXISTS supplier_order_part_order_idx    ON supplier_order_part (supplier_order_id);
CREATE INDEX IF NOT EXISTS supplier_order_part_design_idx   ON supplier_order_part (part_design_id);
CREATE INDEX IF NOT EXISTS supplier_order_part_upstream_idx ON supplier_order_part (upstream_part_id);
