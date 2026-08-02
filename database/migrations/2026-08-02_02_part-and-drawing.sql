-- 零件与图纸版本
--
-- 核心设计（见设计文档 1 §3.1）：
--   ★ 核心实体是「图纸版本」PartRevision，不是「零件」
--   ★ 报价 / 订单 / 生产 / 质检 / 发货 全部外键到 part_revision_id
--   ★ 绝不锚定「最新版本」——「按 Rev B 报的价、按 Rev C 生产」是行业经典事故
--   ★ 图纸有两份产物：original（仅内部可见）+ sanitized（脱敏后才能下发供应商）

-- ============================================================
-- 规格模板 —— 非标定制的规格维度是发散的，用 jsonb + 模板，不建 200 个列
-- ============================================================

CREATE TABLE IF NOT EXISTS spec_template (
    id                  uuid PRIMARY KEY,
    category            text        NOT NULL,   -- CNC_MILLING | CNC_TURNING | SHEET_METAL | CASTING | INJECTION ...
    name                text        NOT NULL,
    version             int         NOT NULL DEFAULT 1,
    -- 字段定义：[{key, label_code, type, unit, required, options[]}]
    -- label_code 是 i18n code，不是文案 —— 后端只返 code
    schema              jsonb       NOT NULL DEFAULT '[]'::jsonb,
    status              text        NOT NULL DEFAULT 'ACTIVE',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS spec_template_uk ON spec_template (category, version);


-- ============================================================
-- 零件（逻辑零件，可跨 RFQ 复用 —— 客户返单时不用重传图纸）
-- ============================================================

CREATE TABLE IF NOT EXISTS part (
    id                  uuid PRIMARY KEY,
    customer_party_id   uuid        NOT NULL REFERENCES party (id),
    -- 客户自己的零件号。同一客户内唯一，跨客户可重复
    customer_part_no    text,
    name                text        NOT NULL,
    category            text,
    created_by_user_id  uuid        REFERENCES party_user (id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS part_customer_idx ON part (customer_party_id);
CREATE UNIQUE INDEX IF NOT EXISTS part_customer_partno_uk
    ON part (customer_party_id, customer_part_no) WHERE customer_part_no IS NOT NULL;


-- ============================================================
-- 图纸版本 ★核心实体
-- ============================================================

CREATE TABLE IF NOT EXISTS part_revision (
    id                  uuid PRIMARY KEY,
    part_id             uuid        NOT NULL REFERENCES part (id),
    rev_code            text        NOT NULL,   -- A / B / C / 1.0 / 客户自己的版本号
    -- 常用规格提成真实列（便于索引和统计）
    material            text,
    qty_hint            int,                    -- 提图纸时的参考数量，真实数量在 rfq_item
    tolerance_grade     text,                   -- ISO 2768-m / -f 等
    surface_treatment   text,
    heat_treatment      text,
    -- 长尾规格进 jsonb
    -- JPA: @JdbcTypeCode(SqlTypes.JSON) + columnDefinition = "jsonb"（写 "json" 是坑）
    spec_template_id    uuid        REFERENCES spec_template (id),
    spec                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    -- 出口管制标记 —— 航空航天 / 军工相关零件需要人工复核
    export_control_flag boolean     NOT NULL DEFAULT false,
    export_control_note text,
    status              text        NOT NULL DEFAULT 'DRAFT',
                                                -- DRAFT | READY | SUPERSEDED
    -- ★ 没有 sanitized 文件，「下发寻源」按钮点不动。这是 service 层的硬校验，
    --   这个冗余列只是为了让列表页不用 join 就能显示状态
    has_sanitized_file  boolean     NOT NULL DEFAULT false,
    created_by_user_id  uuid        REFERENCES party_user (id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT part_revision_status_chk CHECK (status IN ('DRAFT', 'READY', 'SUPERSEDED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS part_revision_uk       ON part_revision (part_id, rev_code);
CREATE INDEX        IF NOT EXISTS part_revision_part_idx ON part_revision (part_id, created_at DESC);


-- ============================================================
-- 图纸文件 —— 一个版本有多份产物
-- ============================================================

CREATE TABLE IF NOT EXISTS part_file (
    id                  uuid PRIMARY KEY,
    part_revision_id    uuid        NOT NULL REFERENCES part_revision (id),
    file_object_id      uuid        NOT NULL REFERENCES file_object (id),
    -- ORIGINAL    客户上传的原件，★仅 OPERATOR 可见
    -- SANITIZED   脱敏版（标题栏遮盖 + 元数据清洗），下发供应商用
    -- PREVIEW     PDF/图片预览，供应商手机上直接看
    -- WATERMARKED 带供应商水印的副本（每个供应商一份）
    kind                text        NOT NULL,
    -- WATERMARKED 时指向具体供应商，其余为 NULL
    watermark_party_id  uuid        REFERENCES party (id),
    watermark_batch     text,                   -- 下发批次，泄露溯源用
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT part_file_kind_chk
        CHECK (kind IN ('ORIGINAL', 'SANITIZED', 'PREVIEW', 'WATERMARKED')),
    -- 水印件必须指明是给谁的；非水印件不许带 party
    CONSTRAINT part_file_watermark_chk
        CHECK ((kind = 'WATERMARKED') = (watermark_party_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS part_file_revision_idx ON part_file (part_revision_id, kind);
CREATE UNIQUE INDEX IF NOT EXISTS part_file_watermark_uk
    ON part_file (part_revision_id, watermark_party_id, watermark_batch)
    WHERE kind = 'WATERMARKED';


-- 补上 01 迁移里 file_access_log 对 part_revision 的外键
ALTER TABLE file_access_log DROP CONSTRAINT IF EXISTS file_access_log_revision_fk;
ALTER TABLE file_access_log ADD CONSTRAINT file_access_log_revision_fk
    FOREIGN KEY (part_revision_id) REFERENCES part_revision (id);
