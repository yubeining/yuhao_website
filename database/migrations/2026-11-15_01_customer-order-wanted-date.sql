-- 客户「期望交货日期」—— 由天数（wanted_lead_days）改成具体日期，客户更容易理解。
--
-- 旧列暂不删除：回滚到上一版 jar 时旧代码仍会写 wanted_lead_days，留着不至于报错。
-- 两个发布周期后（确认不需要回滚）再用一个迁移删掉它。
ALTER TABLE customer_order ADD COLUMN IF NOT EXISTS wanted_date date;

COMMENT ON COLUMN customer_order.wanted_date IS '客户期望的交货日期，仅参考；不是运营承诺的交期';
