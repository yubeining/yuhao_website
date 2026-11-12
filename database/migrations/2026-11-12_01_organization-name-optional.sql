-- 公司名改为可空 —— 注册不再要求填公司名。
--
-- 背景（2026-11-12 需求方拍板，见 docs/design/14）：
--   注册阶段收公司名等于「注册即建公司」，一家公司招第二个采购就只能再注册一次，
--   库里会出现两家同名公司，订单各挂一半。所以注册只建「人 + 一家还没名字的公司」，
--   公司名在提交订单前补。
--
-- 为什么不是把 org_id 改成可空：
--   受众（客户 / 供应商）是由 organization.type 推出来的，租户 id 也来自 org。
--   没有 org 就既不知道这个人是哪一端，也拿不到 partyId —— 登录都签不出 token。
--   保留 org、只让名字可空，模型不用动，15 处 @CurrentParty 也不用改。

ALTER TABLE organization ALTER COLUMN name DROP NOT NULL;

COMMENT ON COLUMN organization.name IS
    '公司名。为空 = 注册时还没填，提交订单前必须补（见 docs/design/14 §4）。';
