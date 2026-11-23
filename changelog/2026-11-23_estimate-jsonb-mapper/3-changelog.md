# AI 估价存库损坏 —— 变更记录

## 改动

- `backend/src/main/resources/application.yml`：`hibernate.type.json_format_mapper: jackson3`。
- `database/migrations/2026-11-23_02_delete-corrupted-price-estimates.sql`：删掉写坏的估价记录；迁移 README 同步。
- `QuoteFlowIT.savedEstimateRoundTripsThroughTheDatabase`：先红（库里存的是节点属性）后绿。
- `platform/config/AppSettingRepository`：注释里「映射器是 Jackson 2」已不成立，改成历史说明。

## 验证

- 新测试改配置前失败（库里是 `{"int": false, ...}`），改后通过。
- `mvn verify`：单元 124、集成 164 全过（5 个跳过）。
- 迁移 SQL 在本地事务里试过（插一条坏的、一条正常的，只删坏的，然后回滚）；本地启动时迁移执行器正常应用。

## 已知代价 / 遗留

- 线上已有的估价记录内容无法恢复，删除后要运营重新估价（只有 11-18 测试时的几条）。
- 回滚到上一版 jar 会重新用 Jackson 2 写坏新估价；确定不回滚之前别大量估价。

## 部署清单

- 一个迁移（只删数据），无新增环境变量。
