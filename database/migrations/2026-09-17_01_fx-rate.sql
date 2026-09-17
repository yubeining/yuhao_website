-- 汇率：每天从欧洲央行（ECB）拉取的参考汇率（2026-09-17 对话决策）。归属 platform/fx（设计文档 2 §2）。
--
-- 需求方决定：先接入 ECB 免费参考汇率，只取数、只存；汇率何时锁定、和银行实际汇率的差额谁承担，之后再定。
-- 所以本表只是「ECB 某天公布了什么」的原始记录，不含任何换算、buffer、锁定。
--
-- ★ ECB 声明这是参考汇率，不建议直接用于交易；实测和中国银行现汇买入价差约 1%（2026-09-17）。
--
-- 设计要点：
--   * 一行 = ECB 某天公布的一个币种对。ECB 恒以 EUR 为基准，给多少币种就存多少，不挑。
--   * rate_date 是 ECB 的发布日期（CET 日历日），不是拉取时刻，所以用 date；拉取时刻另存 fetched_at（UTC）。
--   * 只增不改：同一天重复拉取靠唯一索引 + ON CONFLICT DO NOTHING 跳过（CLAUDE.md §8 要求的 DB 兜底）。
--   * bigserial 主键，不带 version / updated_at（同审计表）。
--   * 币种格式用长度 + 大写判断，不用正则 —— 迁移执行器按 ; 切语句，少写特殊字符。
--
-- 新表，没有旧代码依赖，一次发布即可。无外键（§4）。幂等：全部 IF NOT EXISTS。

CREATE TABLE IF NOT EXISTS fx_rate (
    id             bigserial   PRIMARY KEY,
    source         text        NOT NULL,
    rate_date      date        NOT NULL,   -- 数据源公布的日期
    base_currency  text        NOT NULL,   -- ECB 恒为 EUR
    quote_currency text        NOT NULL,
    rate           numeric(18, 8) NOT NULL, -- 1 个 base_currency 兑多少 quote_currency
    fetched_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT fx_rate_source_chk CHECK (source IN ('ECB')),
    CONSTRAINT fx_rate_rate_positive CHECK (rate > 0),
    CONSTRAINT fx_rate_currency_code_chk CHECK (
        char_length(base_currency) = 3 AND base_currency = upper(base_currency)
        AND char_length(quote_currency) = 3 AND quote_currency = upper(quote_currency))
);
CREATE UNIQUE INDEX IF NOT EXISTS fx_rate_source_date_pair_uk
    ON fx_rate (source, rate_date, base_currency, quote_currency);
