-- 平台核心：交易方 / 用户 / 文件 / 审计
--
-- 约定（见 CLAUDE.md > 数据库迁移）：
--   * 全部幂等：每条 DDL 用 IF [NOT] EXISTS
--   * 主键统一 uuid
--   * 时间统一 timestamptz
--   * 禁止 DO $$ 块（迁移执行器按 ";" 切语句，不认美元引号）
--   * 平台表无前缀，业务表也不加前缀（单一业务系统，无需区分业务线）

-- ============================================================
-- 交易方（Party）—— 客户公司 / 供应商 / 我们自己
-- ============================================================

CREATE TABLE IF NOT EXISTS party (
    id                  uuid PRIMARY KEY,
    type                text        NOT NULL,   -- CUSTOMER | SUPPLIER | OPERATOR
    code                text        NOT NULL,   -- 内部编码 C-0012 / S-003 / OP-01
    name                text        NOT NULL,
    legal_name          text,
    country             text,                   -- ISO 3166-1 alpha-2
    vat_number          text,                   -- 欧洲客户的增值税号
    default_currency    text        NOT NULL DEFAULT 'EUR',
    default_incoterm    text,                   -- EXW | FOB | CIF | DAP | DDP
    status              text        NOT NULL DEFAULT 'PENDING',
                                                -- PENDING | ACTIVE | SUSPENDED
    -- 因为「客户点接受即成单」，首次下单前必须完成 KYC + 条款签署
    kyc_status          text        NOT NULL DEFAULT 'NOT_STARTED',
                                                -- NOT_STARTED | SUBMITTED | APPROVED | REJECTED
    kyc_approved_at     timestamptz,
    terms_signed_at     timestamptz,
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT party_type_chk   CHECK (type IN ('CUSTOMER', 'SUPPLIER', 'OPERATOR')),
    CONSTRAINT party_status_chk CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS party_code_uk ON party (code);
CREATE INDEX IF NOT EXISTS party_type_status_idx ON party (type, status);


CREATE TABLE IF NOT EXISTS party_user (
    id                  uuid PRIMARY KEY,
    party_id            uuid        NOT NULL REFERENCES party (id),
    email               text,
    phone               text,
    display_name        text        NOT NULL,
    -- 各端内部角色。客户/供应商端只有 ADMIN | MEMBER；
    -- OPERATOR 端才有 SALES / SOURCING / QC / LOGISTICS / FINANCE / ADMIN
    role                text        NOT NULL DEFAULT 'MEMBER',
    locale              text        NOT NULL DEFAULT 'en',
    timezone            text        NOT NULL DEFAULT 'UTC',
    password_hash       text,                   -- 仅客户端（邮箱密码）使用
    status              text        NOT NULL DEFAULT 'ACTIVE',
    last_login_at       timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT party_user_status_chk CHECK (status IN ('ACTIVE', 'DISABLED')),
    -- 邮箱或手机至少有一个，否则无法登录
    CONSTRAINT party_user_identity_chk CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS party_user_email_uk ON party_user (lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS party_user_phone_uk ON party_user (phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS party_user_party_idx ON party_user (party_id);


-- ============================================================
-- 文件对象 —— 所有上传文件的统一登记表
-- 图纸/附件/报告/单据都在这里，业务表只引用 file_object.id
-- ============================================================

CREATE TABLE IF NOT EXISTS file_object (
    id                  uuid PRIMARY KEY,
    -- 归属交易方。NULL = 平台自有文件（如模板）
    owner_party_id      uuid        REFERENCES party (id),
    -- 存储位置。用 URI 形式（gs://bucket/key 或 s3://bucket/key），
    -- 绝不在业务代码里硬编码桶名或区域 —— 将来拆欧洲区靠这个
    storage_uri         text        NOT NULL,
    original_filename   text        NOT NULL,   -- 展示用；对象名是服务端生成的 UUID
    mime_type           text        NOT NULL,   -- complete 时按 magic bytes 复核过的真实类型
    size_bytes          bigint      NOT NULL,
    checksum_sha256     text,
    purpose             text        NOT NULL,   -- DRAWING | ATTACHMENT | QC_REPORT | DOCUMENT | AVATAR ...
    -- 上传生命周期：直传对象存储，后端不碰字节
    upload_status       text        NOT NULL DEFAULT 'PENDING',
                                                -- PENDING | COMPLETED | FAILED | EXPIRED
    scan_status         text        NOT NULL DEFAULT 'PENDING',
                                                -- PENDING | CLEAN | INFECTED | SKIPPED
    uploaded_by_user_id uuid        REFERENCES party_user (id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    completed_at        timestamptz,
    CONSTRAINT file_object_upload_status_chk CHECK (upload_status IN ('PENDING','COMPLETED','FAILED','EXPIRED')),
    CONSTRAINT file_object_scan_status_chk   CHECK (scan_status   IN ('PENDING','CLEAN','INFECTED','SKIPPED'))
);

CREATE INDEX IF NOT EXISTS file_object_owner_idx  ON file_object (owner_party_id);
CREATE INDEX IF NOT EXISTS file_object_status_idx ON file_object (upload_status, created_at);


-- ============================================================
-- 图纸访问日志 ★合规硬需求
-- 跟欧洲客户签保密协议时的交付物：能一键导出某个图纸版本的完整访问记录
-- 每一次生成签名 URL 就是一次访问事件
-- ============================================================

CREATE TABLE IF NOT EXISTS file_access_log (
    id                  bigserial PRIMARY KEY,
    file_object_id      uuid        NOT NULL REFERENCES file_object (id),
    part_revision_id    uuid,                   -- 冗余，方便按图纸版本查（外键在 02 迁移后补）
    accessor_user_id    uuid        NOT NULL REFERENCES party_user (id),
    accessor_party_id   uuid        NOT NULL REFERENCES party (id),
    access_type         text        NOT NULL,   -- VIEW | DOWNLOAD | SIGNED_URL_ISSUED
    context             text,                   -- 业务上下文：RFQ-1024 / SP-88 / PO-301
    ip_address          inet,
    user_agent          text,
    accessed_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS file_access_log_file_idx     ON file_access_log (file_object_id, accessed_at DESC);
CREATE INDEX IF NOT EXISTS file_access_log_revision_idx ON file_access_log (part_revision_id, accessed_at DESC);
CREATE INDEX IF NOT EXISTS file_access_log_party_idx    ON file_access_log (accessor_party_id, accessed_at DESC);


-- ============================================================
-- 审计事件
-- 只记结构性 / 生命周期 / 高危安全事件，不记常规字段编辑
-- payload 只放 ID / 枚举 / 计数 / 变更字段名集合
-- ★ 绝不放：姓名 / 邮箱 / 电话 / 价格 / 自由文本 / 原始 IP
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_event (
    id                  bigserial PRIMARY KEY,
    -- 动作命名：<域>.<子域>.<动词>，状态流转有自己的动词
    -- 例：quote.customer.send / quote.customer.accept / order.status_change
    -- ★ 不要写成 order.update + status=xxx
    action              text        NOT NULL,
    target_type         text        NOT NULL,   -- rfq | customer_quote | sales_order | part_revision ...
    target_id           text,
    actor_user_id       uuid        REFERENCES party_user (id),
    actor_party_id      uuid        REFERENCES party (id),
    payload             jsonb       NOT NULL DEFAULT '{}'::jsonb,
    ip_hash             text,                   -- 哈希后的 IP，不存原始值
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_event_target_idx ON audit_event (target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_event_actor_idx  ON audit_event (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_event_action_idx ON audit_event (action, created_at DESC);


-- ============================================================
-- 访问授权（ops 端内部 RBAC）
-- 客户端 / 供应商端不用这张表 —— 它们的角色只有 ADMIN | MEMBER，代码里判断即可
-- 端级隔离由 PortalGuardInterceptor 按路径前缀硬拒，不依赖这张表
-- ============================================================

CREATE TABLE IF NOT EXISTS access_grant (
    id                  uuid PRIMARY KEY,
    user_id             uuid        NOT NULL REFERENCES party_user (id),
    resource_key        text        NOT NULL,   -- 见 RouteAccessRegistry，如 ops/sourcing
    action              text        NOT NULL,   -- READ | WRITE
    granted_by_user_id  uuid        REFERENCES party_user (id),
    expires_at          timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT access_grant_action_chk CHECK (action IN ('READ', 'WRITE'))
);

CREATE UNIQUE INDEX IF NOT EXISTS access_grant_uk ON access_grant (user_id, resource_key, action);
