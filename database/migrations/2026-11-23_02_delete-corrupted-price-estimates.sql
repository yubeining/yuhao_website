-- 删掉内容已经损坏的 AI 估价记录（2026-11-23 需求方批准）。
--
-- 原因：Hibernate 的 jsonb 映射器默认挑了 Jackson 2，而 price_estimate 三个 jsonb 字段在实体里是 Jackson 3 的 JsonNode。
-- 写进库的不是估价内容，而是 {"nodeType":"OBJECT","empty":false,...} 这种节点属性 —— 明细、AI 假设、需确认项全丢，
-- 无法恢复；读的时候直接抛异常，运营报价工作台的估价列表 500。同一次发布把映射器改成了 Jackson 3
-- （application.yml 的 hibernate.type.json_format_mapper），之后写入的记录是正常的。
--
-- 只删三个 jsonb 列顶层带 nodeType 键的行（正常的估价没有这个键）。删了之后运营重新点「估价」即可。
-- 只删数据、不改结构，旧版本代码不受影响；重复执行时没有匹配行，天然幂等。
-- ★ 不用 jsonb 的「键是否存在」运算符（一个问号）：迁移经 JDBC 执行，问号会被当成参数占位符。

DELETE FROM price_estimate
WHERE breakdown ->> 'nodeType' IS NOT NULL
   OR ai_output ->> 'nodeType' IS NOT NULL
   OR input_snapshot ->> 'nodeType' IS NOT NULL;
