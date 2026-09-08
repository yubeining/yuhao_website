-- 身份(用户 / 组织 / 角色)+ 配置 / 字典 —— schema 归零后重建的第一批基础表。
--
-- 设计对齐(2026-09-08 对话决策):
--   * 内外用户物理拆表(ops_user / external_user),不混一张(跨端泄露是头号风险)
--   * organization / role 共用,用标签区分:organization.type、role.scope
--   * 一人一公司:用户带 org_id(单值),公司内可有多个角色(user_role 多对多)
--   * app_setting:全局 KV 业务配置,value 为 jsonb(数字/字符串/对象都合法)
--   * dict:数据字典单表,type 分组
--
-- 约定(CLAUDE.md §4/§5):无外键,关联用裸 uuid + 显式索引;主键 uuid(应用侧生成,无默认);
-- 时间 timestamptz;枚举用 text + CHECK;继承 BaseEntity 的表带 version bigint。全部幂等。

-- ============================================================
-- organization —— 组织 / 公司(共用:内部我方 + 客户 + 供应商,用 type 区分)
-- ============================================================
CREATE TABLE IF NOT EXISTS organization (
    id          uuid PRIMARY KEY,
    type        text        NOT NULL,   -- INTERNAL | CUSTOMER | SUPPLIER（受众来源）
    name        text        NOT NULL,
    country     text,                   -- ISO 3166-1 alpha-2
    status      text        NOT NULL DEFAULT 'ACTIVE',   -- ACTIVE | DISABLED
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    version     bigint      NOT NULL DEFAULT 0,
    CONSTRAINT organization_type_chk   CHECK (type   IN ('INTERNAL', 'CUSTOMER', 'SUPPLIER')),
    CONSTRAINT organization_status_chk CHECK (status IN ('ACTIVE', 'DISABLED'))
);
CREATE INDEX IF NOT EXISTS organization_type_idx ON organization (type);

-- ============================================================
-- ops_user —— 内部用户(运营 / 管理),物理独立于外部用户
-- ============================================================
CREATE TABLE IF NOT EXISTS ops_user (
    id            uuid PRIMARY KEY,
    org_id        uuid        NOT NULL,   -- → organization(type=INTERNAL)
    email         text        NOT NULL,
    password_hash text,
    display_name  text        NOT NULL,
    status        text        NOT NULL DEFAULT 'ACTIVE',
    locale        text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    version       bigint      NOT NULL DEFAULT 0,
    CONSTRAINT ops_user_status_chk CHECK (status IN ('ACTIVE', 'DISABLED'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ops_user_email_uk ON ops_user (email);
CREATE INDEX IF NOT EXISTS ops_user_org_idx ON ops_user (org_id);

-- ============================================================
-- external_user —— 外部用户(客户 / 供应商联系人)
-- ============================================================
CREATE TABLE IF NOT EXISTS external_user (
    id            uuid PRIMARY KEY,
    org_id        uuid        NOT NULL,   -- → organization(type=CUSTOMER|SUPPLIER)
    email         text        NOT NULL,
    password_hash text,
    display_name  text        NOT NULL,
    status        text        NOT NULL DEFAULT 'ACTIVE',
    locale        text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    version       bigint      NOT NULL DEFAULT 0,
    CONSTRAINT external_user_status_chk CHECK (status IN ('ACTIVE', 'DISABLED'))
);
CREATE UNIQUE INDEX IF NOT EXISTS external_user_email_uk ON external_user (email);
CREATE INDEX IF NOT EXISTS external_user_org_idx ON external_user (org_id);

-- ============================================================
-- role —— 角色字典(共用,scope 区分内外)
-- ============================================================
CREATE TABLE IF NOT EXISTS role (
    id            uuid PRIMARY KEY,
    scope         text        NOT NULL,   -- INTERNAL | EXTERNAL
    code          text        NOT NULL,   -- 该 scope 内唯一：外 ADMIN/MEMBER，内 SALES/QC/...
    name_i18n_key text        NOT NULL,   -- 前端翻译（§6 后端只返 code / key）
    status        text        NOT NULL DEFAULT 'ACTIVE',
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    version       bigint      NOT NULL DEFAULT 0,
    CONSTRAINT role_scope_chk  CHECK (scope  IN ('INTERNAL', 'EXTERNAL')),
    CONSTRAINT role_status_chk CHECK (status IN ('ACTIVE', 'DISABLED'))
);
CREATE UNIQUE INDEX IF NOT EXISTS role_scope_code_uk ON role (scope, code);

-- ============================================================
-- user_role —— 用户 ↔ 角色(多对多,共用)
--   user_id 指向 ops_user.id 或 external_user.id（裸 uuid，靠所在 scope 在 service 层保证一致）
-- ============================================================
CREATE TABLE IF NOT EXISTS user_role (
    id          uuid PRIMARY KEY,
    user_id     uuid        NOT NULL,   -- → ops_user.id | external_user.id
    role_id     uuid        NOT NULL,   -- → role.id
    granted_by  uuid,                   -- 授权人（ops_user.id），可空
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    version     bigint      NOT NULL DEFAULT 0
);
-- 唯一(user_id, role_id)：同一用户同一角色只一条；该索引左前缀同时服务"按 user 查角色"
CREATE UNIQUE INDEX IF NOT EXISTS user_role_uk ON user_role (user_id, role_id);
CREATE INDEX IF NOT EXISTS user_role_role_idx ON user_role (role_id);

-- ============================================================
-- app_setting —— 全局业务配置(KV，ConfigService 的第 3 层)
--   ★ 基建 / 密钥不进这里（走 env / yml，第 1/2 层）。config_key 用点号命名，与 yml 属性路径一致。
--   ★ key / value 是 SQL 保留字，加限定词避开（§4）。
-- ============================================================
CREATE TABLE IF NOT EXISTS app_setting (
    id            uuid PRIMARY KEY,
    config_key    text        NOT NULL,   -- 如 quote.validity.days
    config_value  jsonb       NOT NULL,   -- 数字 / 字符串 / 对象 / 数组都合法
    value_type    text        NOT NULL DEFAULT 'STRING',   -- STRING|NUMBER|BOOL|JSON，仅校验/展示
    description   text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    version       bigint      NOT NULL DEFAULT 0,
    CONSTRAINT app_setting_value_type_chk CHECK (value_type IN ('STRING', 'NUMBER', 'BOOL', 'JSON'))
);
CREATE UNIQUE INDEX IF NOT EXISTS app_setting_key_uk ON app_setting (config_key);

-- ============================================================
-- dict —— 数据字典 / 选项主数据(单表，type 分组；DictService 读，带缓存)
-- ============================================================
CREATE TABLE IF NOT EXISTS dict (
    id          uuid PRIMARY KEY,
    type        text        NOT NULL,   -- 分组：COUNTRY | CURRENCY | MATERIAL | ...
    code        text        NOT NULL,   -- 该 type 内唯一：CN | DE | EUR ...
    names       jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- 多语显示名 {"en":..,"zh":..}
    sort_order  integer     NOT NULL DEFAULT 0,
    status      text        NOT NULL DEFAULT 'ACTIVE',
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    version     bigint      NOT NULL DEFAULT 0,
    CONSTRAINT dict_status_chk CHECK (status IN ('ACTIVE', 'DISABLED'))
);
-- 唯一(type, code)；左前缀同时服务"按 type 取选项列表"
CREATE UNIQUE INDEX IF NOT EXISTS dict_type_code_uk ON dict (type, code);
