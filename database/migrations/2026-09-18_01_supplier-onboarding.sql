-- 供应商入驻：运营邀请 → 凭链接注册 → 运营录折率和能力（设计文档 11 §4 第 4 步 4a，2026-09-18 需求方拍板）。
--
-- 已拍板（文档 11，2026-09-18）：
--   * 供应商账号只能运营邀请；邀请链接 7 天有效、用一次就失效、运营可随时作废。邮件未接，链接由运营自己发。
--   * 注册只填公司名 + 联系人 + 邮箱 + 密码；开票、银行、执照等资料等合同 / 结算那一步再收。
--   * 对供价 = 原价 × 该供应商折率；填 0.8 = 乘 0.8（文档 13 §2.2）。运营录好折率这家才能被派单。
--   * 能力（工艺 / 材料 / 尺寸范围 / 精度等级）由运营录，自由文本，系统不判断匹配。
--
-- 设计要点：
--   * supplier_invite 归 platform/identity（建组织和用户本来就在那里）。只存 token 的 SHA-256，
--     明文只出现在生成时的响应里 —— 库被读走也拿不到能用的链接。
--   * 邀请绑定邮箱（推导，不是给定的）：注册邮箱必须是邀请上写的那个，防链接转手。
--   * used_at 非空 = 已用；并发两次注册靠 `where used_at is null` 的条件更新只让一次成功。
--   * supplier_profile 归新域 domain/supplier（文档 2 目录规划里的「供应商能力库」）。
--     折率放这里而不是报价域：订单域派单要判断「有没有折率」，放报价域会让订单域反向依赖报价域。
--
-- 新表，没有旧代码依赖，一次发布即可。无外键（§4），关联列都建了索引。幂等：全部 IF NOT EXISTS。

CREATE TABLE IF NOT EXISTS supplier_invite (
    id                 uuid        PRIMARY KEY,
    token_hash         text        NOT NULL,   -- SHA-256(token) 的十六进制
    org_name           text        NOT NULL,   -- 运营填的企业名，注册页预填，供应商可改
    email              text        NOT NULL,   -- 小写；注册邮箱必须是它
    expires_at         timestamptz NOT NULL,
    used_at            timestamptz,
    used_by_org_id     uuid,
    revoked_at         timestamptz,
    created_by_user_id uuid        NOT NULL,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    version            bigint      NOT NULL DEFAULT 0,
    CONSTRAINT supplier_invite_used_chk CHECK ((used_at IS NULL) = (used_by_org_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS supplier_invite_token_hash_uk ON supplier_invite (token_hash);
CREATE INDEX IF NOT EXISTS supplier_invite_email_idx ON supplier_invite (email);
CREATE INDEX IF NOT EXISTS supplier_invite_used_by_org_idx ON supplier_invite (used_by_org_id);

CREATE TABLE IF NOT EXISTS supplier_profile (
    id              uuid        PRIMARY KEY,
    supplier_org_id uuid        NOT NULL,
    discount_rate   numeric(8, 4),            -- 对供价 = 原价 × 本值；0.8 = 八折。为空 = 还没录，不能派单
    processes       text,                     -- 以下四项运营录，自由文本
    materials       text,
    size_range      text,
    precision_grade text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    version         bigint      NOT NULL DEFAULT 0,
    CONSTRAINT supplier_profile_discount_positive CHECK (discount_rate IS NULL OR discount_rate > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS supplier_profile_org_uk ON supplier_profile (supplier_org_id);
