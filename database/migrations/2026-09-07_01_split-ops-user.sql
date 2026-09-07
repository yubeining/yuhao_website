-- 拆分内部 / 外部用户。
--
-- 依据：2026-09-07 会话决策 —— 运营(内部)和客户/供应商(外部)是两个不相干的人群，
-- 不能挤在一张 party_user 里（共用一个 email 唯一命名空间、查询漏过滤就跨端泄露）。
-- 决定：运营搬到独立的 ops_user；party / party_user 收窄为只装外部。
--
-- ★ 全部业务表当前为空（无 INSERT 种子），故本迁移不涉及任何数据搬运。
-- ★ 本迁移按 CLAUDE.md §4 用裸 uuid + 显式索引、不建外键，并顺手删掉 access_grant
--   存量的两个外键（删存量外键是天然安全方向，一次发布即可，见 §5）。这也给 §11 Q18 打样。

-- ── 内部：运营员工 ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ops_user (
    id             uuid PRIMARY KEY,
    email          text,                    -- 邮箱密码登录用
    wework_id      text,                    -- 企业微信 userid，扫码登录用
    display_name   text        NOT NULL,
    password_hash  text,                    -- 邮箱密码登录兜底；纯企微账号可空
    status         text        NOT NULL DEFAULT 'ACTIVE',
    last_login_at  timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ops_user_status_chk   CHECK (status IN ('ACTIVE', 'DISABLED')),
    -- 至少有一种登录标识，否则这个账号谁也登不进来
    CONSTRAINT ops_user_identity_chk CHECK (email IS NOT NULL OR wework_id IS NOT NULL)
);

-- email / wework_id 的唯一性只在【运营命名空间内】—— 和外部 party_user 互不干扰。
-- 这正是本次拆分要的：运营员工和客户可以用同一个邮箱，各是各的账号。
CREATE UNIQUE INDEX IF NOT EXISTS ops_user_email_uk  ON ops_user (lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ops_user_wework_uk ON ops_user (wework_id)    WHERE wework_id IS NOT NULL;

-- ── access_grant（内部 RBAC）现在授权给 ops_user，不再是 party_user ──────
-- user_id / granted_by_user_id 从此是 ops_user 的 id。删掉存量指向 party_user 的外键。
ALTER TABLE access_grant DROP CONSTRAINT IF EXISTS access_grant_user_id_fkey;
ALTER TABLE access_grant DROP CONSTRAINT IF EXISTS access_grant_granted_by_user_id_fkey;
COMMENT ON COLUMN access_grant.user_id            IS 'ops_user id — internal RBAC subject';
COMMENT ON COLUMN access_grant.granted_by_user_id IS 'ops_user id — who granted it';

-- ── 外部：party 收窄为只装客户 / 供应商 ────────────────────────────
-- 运营已搬到 ops_user，party.type 不再有 OPERATOR。无 OPERATOR 数据行，收紧 CHECK 安全
-- （CLAUDE.md §5：没有写入方依赖被删的取值 —— 业务代码还没有一处 INSERT party）。
-- DROP IF EXISTS + ADD 成对，保证重跑安全。
ALTER TABLE party DROP CONSTRAINT IF EXISTS party_type_chk;
ALTER TABLE party ADD  CONSTRAINT party_type_chk CHECK (type IN ('CUSTOMER', 'SUPPLIER'));

COMMENT ON TABLE party      IS 'external organization: a customer or a supplier company (never the operator)';
COMMENT ON TABLE party_user IS 'a person inside an external party (customer/supplier). ops staff live in ops_user';
