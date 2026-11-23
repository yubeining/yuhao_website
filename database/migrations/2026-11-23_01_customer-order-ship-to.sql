-- 客户订单的收货地址（2026-11-23 需求方拍板）：提交订单时必填，订单就绪（READY）之前客户都能改。
--
-- 字段参照跨境电商常见的地址表单（Shopify / Amazon / Google libaddressinput）和国际快递的收件信息：
-- 国家（ISO 3166-1 两位代码）、收货公司、收货人、电话、地址行 1、城市 必填；地址行 2、州/省、邮编 选填
-- （不是每个国家都用州/省或邮编）。必填由 service 在提交和保存时校验，库里全部可空 ——
-- 草稿阶段可以不填，存量订单也没有这些值。
--
-- 归 domain/order，挂在 customer_order 上（客户侧订单）。设计文档 1 §3.2：不向供应商暴露客户的收货地址，
-- 所以供应商侧的 ops_order / supplier_order 不复制这些列。
-- 只加可空列，旧版本代码不受影响，无需扩展-收缩。

ALTER TABLE customer_order ADD COLUMN IF NOT EXISTS ship_to_country text;
ALTER TABLE customer_order ADD COLUMN IF NOT EXISTS ship_to_company text;
ALTER TABLE customer_order ADD COLUMN IF NOT EXISTS ship_to_contact text;
ALTER TABLE customer_order ADD COLUMN IF NOT EXISTS ship_to_phone text;
ALTER TABLE customer_order ADD COLUMN IF NOT EXISTS ship_to_line1 text;
ALTER TABLE customer_order ADD COLUMN IF NOT EXISTS ship_to_line2 text;
ALTER TABLE customer_order ADD COLUMN IF NOT EXISTS ship_to_city text;
ALTER TABLE customer_order ADD COLUMN IF NOT EXISTS ship_to_region text;
ALTER TABLE customer_order ADD COLUMN IF NOT EXISTS ship_to_postal_code text;
