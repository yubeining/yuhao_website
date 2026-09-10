-- 零件图纸：版本 + 文件 + 访问审计（2026-09-10 对话决策，设计文档 11 §4 第 1 步）。
--
-- 背景：2026-09-08_03 把旧的 part / part_revision / part_file / file_object / file_access_log
-- 全删了，库里只剩 part_design 骨架。本迁移从零建图纸这一段。
--
-- 已拍板（2026-09-10）：
--   * 图纸挂 part_design（零件主数据）下，一个零件多个版本，每版一套文件。
--     订单行锁定具体版本 —— 那列随第 2 步建订单行时加（CLAUDE.md §3 铁律 7）。
--   * 版本号我方编，每个零件从 1 开始；客户文件名里的 A/B/C 进 customer_rev，只展示不参与判断。
--   * 审计先只存、不做导出（红线 1 后半句明确推迟）；不存 IP。
--
-- 设计要点：
--   * customer_org_id 冗余到 part_revision / part_file / 审计表：租户条件直接写进查询
--     （§3 铁律 2），不用每次回查 part_design。零件的归属客户永不改变，冗余没有漂移风险。
--   * storage_key 由服务端生成（drawing/<uuid>），不含客户文件名（设计文档 2 §5.1）。
--   * part_file_access_log 只记零件图纸、归订单域，所以不叫通用的 file_access_log。
--     别的域也要文件审计时再抽到 platform。
--   * 审计表只增不改，bigserial 主键，不继承 BaseEntity（没有 version / updated_at）。
--
-- 无外键（§4）：全部裸 uuid + 显式索引。三张新表，没有写入路径依赖旧 jar，一次发布即可。
-- 幂等：全部 IF NOT EXISTS。

CREATE TABLE IF NOT EXISTS part_revision (
    id                 uuid        PRIMARY KEY,
    part_design_id     uuid        NOT NULL,
    customer_org_id    uuid        NOT NULL,   -- 冗余自 part_design，租户条件用
    rev_no             integer     NOT NULL,   -- 我方编号，每个零件从 1 开始
    customer_rev       text,                   -- 客户自己的版本标记（A/B/C），只展示
    created_by_user_id uuid        NOT NULL,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    version            bigint      NOT NULL DEFAULT 0,
    CONSTRAINT part_revision_rev_no_positive CHECK (rev_no >= 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS part_revision_design_rev_uk ON part_revision (part_design_id, rev_no);
CREATE INDEX IF NOT EXISTS part_revision_customer_idx ON part_revision (customer_org_id);

CREATE TABLE IF NOT EXISTS part_file (
    id                    uuid        PRIMARY KEY,
    part_revision_id      uuid        NOT NULL,
    customer_org_id       uuid        NOT NULL,   -- 冗余自 part_design，租户条件用
    storage_key           text        NOT NULL,   -- 服务端生成，不含客户文件名
    original_filename     text        NOT NULL,   -- 仅展示
    declared_content_type text,                   -- 客户端声称的类型，不可信
    detected_type         text,                   -- complete 时按文件内容判出来的类型
    size_bytes            bigint,                 -- complete 时从存储 head 取
    upload_status         text        NOT NULL,
    uploaded_by_user_id   uuid        NOT NULL,
    completed_at          timestamptz,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    version               bigint      NOT NULL DEFAULT 0,
    CONSTRAINT part_file_upload_status_chk CHECK (upload_status IN ('PENDING', 'COMPLETED', 'REJECTED'))
);
CREATE UNIQUE INDEX IF NOT EXISTS part_file_storage_key_uk ON part_file (storage_key);
CREATE INDEX IF NOT EXISTS part_file_revision_idx ON part_file (part_revision_id);
CREATE INDEX IF NOT EXISTS part_file_customer_idx ON part_file (customer_org_id);

CREATE TABLE IF NOT EXISTS part_file_access_log (
    id                  bigserial   PRIMARY KEY,
    part_file_id        uuid        NOT NULL,
    part_revision_id    uuid        NOT NULL,   -- 冗余，按版本查（设计文档 2 §5.5）
    customer_org_id     uuid        NOT NULL,   -- 图纸归属的客户
    accessor_user_id    uuid        NOT NULL,
    accessor_party_type text        NOT NULL,
    accessor_org_id     uuid,                   -- 运营没有组织，为空
    access_type         text        NOT NULL,
    trace_id            text,                   -- 串到当次请求的日志
    accessed_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT part_file_access_log_party_type_chk
        CHECK (accessor_party_type IN ('CUSTOMER', 'SUPPLIER', 'OPERATOR')),
    CONSTRAINT part_file_access_log_access_type_chk
        CHECK (access_type IN ('SIGNED_URL_ISSUED'))
);
CREATE INDEX IF NOT EXISTS part_file_access_log_revision_idx ON part_file_access_log (part_revision_id, accessed_at DESC);
CREATE INDEX IF NOT EXISTS part_file_access_log_file_idx ON part_file_access_log (part_file_id);
CREATE INDEX IF NOT EXISTS part_file_access_log_customer_idx ON part_file_access_log (customer_org_id);
