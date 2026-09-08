-- 清空全部业务/平台表 —— 业务尚未开工，schema 由使用方从零按自己的方式重建。
--
-- 背景：2026-08-02 的 bootstrap 一次性铺了整套业务 schema（31 张表），
-- 但其中 26 张至今无任何代码在用，与「建表前先判业务含义、按需建」（CLAUDE.md §4）相悖。
-- 经确认：全部删除，连同依赖这些表的 domain 代码（账号 / 审计 / access）一并移除，
-- 仓库回到「只有平台基建、domain 归零」的干净状态，后续由使用方重建。
--
-- 安全性：本方向天然安全，不需要扩展-收缩 —— 删表的同一次发布里，
-- 依赖这些表的代码也一起删了，不存在「旧代码面对缺表的库」的情况。
-- schema_migrations（迁移账本）保留。
--
-- 幂等：全部 IF EXISTS；CASCADE 连带清掉 production_order_item 上的触发器，
-- 以及各表 bigserial 自持的序列（audit_event_id_seq / file_access_log_id_seq）。

DROP TABLE IF EXISTS
    access_grant,
    audit_event,
    customer_quote,
    customer_quote_line,
    file_access_log,
    file_object,
    fx_rate_snapshot,
    lead,
    ops_user,
    order_line,
    part,
    part_file,
    part_revision,
    party,
    party_user,
    pricing_rule,
    production_milestone,
    production_order,
    production_order_item,
    quote_approval,
    rfq,
    rfq_attachment,
    rfq_item,
    sales_order,
    sourcing_item,
    sourcing_package,
    spec_template,
    supplier_capability,
    supplier_invitation,
    supplier_quote,
    supplier_quote_line
    CASCADE;

-- 触发器随表 CASCADE 掉了，函数本体是独立对象，显式清掉。
DROP FUNCTION IF EXISTS public.check_production_allocation() CASCADE;
