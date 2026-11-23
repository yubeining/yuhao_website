# AI 估价存库损坏 —— 实施计划

## 根因（本地集成测试复现）

- 类路径上同时有 Jackson 2（`com.fasterxml`，依赖带进来）和 Jackson 3（`tools.jackson`）。
- Hibernate 7.4 的 jsonb 映射器默认挑 Jackson 2。`price_estimate` 三个 jsonb 字段在实体里是 Jackson 3 的 `JsonNode`。
- 写：Jackson 2 把 Jackson 3 的节点当普通对象序列化，存进去的是 `{"nodeType":"OBJECT","empty":false,...}`，内容全丢。
- 读：Jackson 2 无法构造 Jackson 3 的 `JsonNode`，抛异常 → 500。
- 估价当场返回的是内存对象，所以 11-18 上线验证时看起来正常；之前没有测试从库里读过估算。
- `app_setting` 早先遇到过同一问题，用原生 SQL 绕开了，不受影响。

## 方案（已批准）

1. `application.yml` 加 `spring.jpa.properties.hibernate.type.json_format_mapper: jackson3`。
2. 迁移删掉三个 jsonb 列顶层带 `nodeType` 键的行（内容已无法恢复）。
3. 集成测试：按生产代码的写法存一条估算，校验库里的 JSON 是真内容，再从接口读回来。

## 被否决

- 只改配置不删旧记录：坏记录读出来是空明细，前端会出错，需求方选择删除。
- 把估算字段改成字符串 / 原生 SQL（同 app_setting 的绕法）：改动面大，治标。
