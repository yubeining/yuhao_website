-- 报价的「交期」从「确认后天数」改成「承诺日期」。
--
-- 背景：客户填的是期望交期（一个日期），运营在报价时确认/调整这个日期，客户确认报价 = 接受该日期。
-- 原来只存 lead_days（确认后多少天），客户晚几天确认，实际交期就往后漂几天，和承诺不一致。
--
-- 兼容：新列可空；历史行按「发出日 + lead_days」回填。lead_days 继续保留并继续写，
-- 等下一次发布再删（扩展-收缩，见 CLAUDE.md §5）。

ALTER TABLE quote ADD COLUMN IF NOT EXISTS commit_date date;

UPDATE quote
SET commit_date = (sent_at AT TIME ZONE 'UTC')::date + lead_days
WHERE commit_date IS NULL;
