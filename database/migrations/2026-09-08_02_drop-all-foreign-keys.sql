-- 删除全部存量外键约束。
--
-- 依据：CLAUDE.md §4「禁止数据库外键约束」——「删存量外键约束不需要走扩展-收缩，
-- 一次发布即可（旧版本代码不依赖约束存在，这个方向天然安全）」。
--
-- 背景：08-02 的骨架迁移建表时到处写了 REFERENCES（共 63 个 FK），违反 §4。
-- 关联完整性由 service 层带租户条件显式校验（§3 铁律 3），不靠外键。
-- 本迁移把它们全部 DROP（IF EXISTS 幂等）。库当前为空，零数据风险。
--
-- ★ 名字来自 pg_constraint 实测导出（PG 自动命名 <table>_<column>_fkey，个别是手写名如
--   file_access_log_revision_fk）。以后新增外键由提交闸门 check-no-foreign-keys.py 挡住。

ALTER TABLE audit_event DROP CONSTRAINT IF EXISTS audit_event_actor_party_id_fkey;
ALTER TABLE audit_event DROP CONSTRAINT IF EXISTS audit_event_actor_user_id_fkey;
ALTER TABLE customer_quote DROP CONSTRAINT IF EXISTS customer_quote_customer_party_id_fkey;
ALTER TABLE customer_quote DROP CONSTRAINT IF EXISTS customer_quote_prepared_by_user_id_fkey;
ALTER TABLE customer_quote DROP CONSTRAINT IF EXISTS customer_quote_rfq_id_fkey;
ALTER TABLE customer_quote_line DROP CONSTRAINT IF EXISTS customer_quote_line_customer_quote_id_fkey;
ALTER TABLE customer_quote_line DROP CONSTRAINT IF EXISTS customer_quote_line_part_revision_id_fkey;
ALTER TABLE customer_quote_line DROP CONSTRAINT IF EXISTS customer_quote_line_rfq_item_id_fkey;
ALTER TABLE customer_quote_line DROP CONSTRAINT IF EXISTS customer_quote_line_supplier_quote_line_id_fkey;
ALTER TABLE file_access_log DROP CONSTRAINT IF EXISTS file_access_log_accessor_party_id_fkey;
ALTER TABLE file_access_log DROP CONSTRAINT IF EXISTS file_access_log_accessor_user_id_fkey;
ALTER TABLE file_access_log DROP CONSTRAINT IF EXISTS file_access_log_file_object_id_fkey;
ALTER TABLE file_access_log DROP CONSTRAINT IF EXISTS file_access_log_revision_fk;
ALTER TABLE file_object DROP CONSTRAINT IF EXISTS file_object_owner_party_id_fkey;
ALTER TABLE file_object DROP CONSTRAINT IF EXISTS file_object_uploaded_by_user_id_fkey;
ALTER TABLE lead DROP CONSTRAINT IF EXISTS lead_converted_party_id_fkey;
ALTER TABLE order_line DROP CONSTRAINT IF EXISTS order_line_order_id_fkey;
ALTER TABLE order_line DROP CONSTRAINT IF EXISTS order_line_part_revision_id_fkey;
ALTER TABLE order_line DROP CONSTRAINT IF EXISTS order_line_quote_line_id_fkey;
ALTER TABLE part DROP CONSTRAINT IF EXISTS part_created_by_user_id_fkey;
ALTER TABLE part DROP CONSTRAINT IF EXISTS part_customer_party_id_fkey;
ALTER TABLE part_file DROP CONSTRAINT IF EXISTS part_file_file_object_id_fkey;
ALTER TABLE part_file DROP CONSTRAINT IF EXISTS part_file_part_revision_id_fkey;
ALTER TABLE part_file DROP CONSTRAINT IF EXISTS part_file_watermark_party_id_fkey;
ALTER TABLE part_revision DROP CONSTRAINT IF EXISTS part_revision_created_by_user_id_fkey;
ALTER TABLE part_revision DROP CONSTRAINT IF EXISTS part_revision_part_id_fkey;
ALTER TABLE part_revision DROP CONSTRAINT IF EXISTS part_revision_spec_template_id_fkey;
ALTER TABLE party_user DROP CONSTRAINT IF EXISTS party_user_party_id_fkey;
ALTER TABLE pricing_rule DROP CONSTRAINT IF EXISTS pricing_rule_created_by_user_id_fkey;
ALTER TABLE production_milestone DROP CONSTRAINT IF EXISTS production_milestone_production_order_id_fkey;
ALTER TABLE production_milestone DROP CONSTRAINT IF EXISTS production_milestone_reported_by_user_id_fkey;
ALTER TABLE production_order DROP CONSTRAINT IF EXISTS production_order_issued_by_user_id_fkey;
ALTER TABLE production_order DROP CONSTRAINT IF EXISTS production_order_order_id_fkey;
ALTER TABLE production_order DROP CONSTRAINT IF EXISTS production_order_supplier_party_id_fkey;
ALTER TABLE production_order_item DROP CONSTRAINT IF EXISTS production_order_item_order_line_id_fkey;
ALTER TABLE production_order_item DROP CONSTRAINT IF EXISTS production_order_item_part_revision_id_fkey;
ALTER TABLE production_order_item DROP CONSTRAINT IF EXISTS production_order_item_production_order_id_fkey;
ALTER TABLE quote_approval DROP CONSTRAINT IF EXISTS quote_approval_approver_user_id_fkey;
ALTER TABLE quote_approval DROP CONSTRAINT IF EXISTS quote_approval_customer_quote_id_fkey;
ALTER TABLE rfq DROP CONSTRAINT IF EXISTS rfq_customer_party_id_fkey;
ALTER TABLE rfq DROP CONSTRAINT IF EXISTS rfq_owner_user_id_fkey;
ALTER TABLE rfq DROP CONSTRAINT IF EXISTS rfq_submitted_by_user_id_fkey;
ALTER TABLE rfq_attachment DROP CONSTRAINT IF EXISTS rfq_attachment_file_object_id_fkey;
ALTER TABLE rfq_attachment DROP CONSTRAINT IF EXISTS rfq_attachment_rfq_id_fkey;
ALTER TABLE rfq_item DROP CONSTRAINT IF EXISTS rfq_item_part_revision_id_fkey;
ALTER TABLE rfq_item DROP CONSTRAINT IF EXISTS rfq_item_rfq_id_fkey;
ALTER TABLE sales_order DROP CONSTRAINT IF EXISTS sales_order_customer_party_id_fkey;
ALTER TABLE sales_order DROP CONSTRAINT IF EXISTS sales_order_customer_quote_id_fkey;
ALTER TABLE sales_order DROP CONSTRAINT IF EXISTS sales_order_rfq_id_fkey;
ALTER TABLE sourcing_item DROP CONSTRAINT IF EXISTS sourcing_item_part_revision_id_fkey;
ALTER TABLE sourcing_item DROP CONSTRAINT IF EXISTS sourcing_item_rfq_item_id_fkey;
ALTER TABLE sourcing_item DROP CONSTRAINT IF EXISTS sourcing_item_sourcing_package_id_fkey;
ALTER TABLE sourcing_package DROP CONSTRAINT IF EXISTS sourcing_package_dispatched_by_user_id_fkey;
ALTER TABLE sourcing_package DROP CONSTRAINT IF EXISTS sourcing_package_rfq_id_fkey;
ALTER TABLE supplier_capability DROP CONSTRAINT IF EXISTS supplier_capability_supplier_party_id_fkey;
ALTER TABLE supplier_invitation DROP CONSTRAINT IF EXISTS supplier_invitation_sourcing_package_id_fkey;
ALTER TABLE supplier_invitation DROP CONSTRAINT IF EXISTS supplier_invitation_supplier_party_id_fkey;
ALTER TABLE supplier_quote DROP CONSTRAINT IF EXISTS supplier_quote_invitation_id_fkey;
ALTER TABLE supplier_quote DROP CONSTRAINT IF EXISTS supplier_quote_sourcing_package_id_fkey;
ALTER TABLE supplier_quote DROP CONSTRAINT IF EXISTS supplier_quote_submitted_by_user_id_fkey;
ALTER TABLE supplier_quote DROP CONSTRAINT IF EXISTS supplier_quote_supplier_party_id_fkey;
ALTER TABLE supplier_quote_line DROP CONSTRAINT IF EXISTS supplier_quote_line_sourcing_item_id_fkey;
ALTER TABLE supplier_quote_line DROP CONSTRAINT IF EXISTS supplier_quote_line_supplier_quote_id_fkey;
