# 变更记录 —— 身份 / 配置 / 字典 基础表(重建第一批)

> 2026-09-08 ｜ 新迁移 + 7 个实体 ｜ 无 domain、无 repository/service

## 背景

schema 归零后按对话决策重建的第一批基础表。设计经多轮对齐(见对话),要点:
内外用户物理拆表、organization/role 共用加标签、一人一公司、配置走全局 KV(jsonb)、字典单表。

## 迁移 `2026-09-08_04_identity-and-config.sql` —— 7 张表

| 表 | 作用 | 标签/关键 |
|---|---|---|
| `organization` | 组织/公司(共用) | `type` INTERNAL/CUSTOMER/SUPPLIER —— 受众来源 |
| `ops_user` | 内部用户 | `org_id`,email 表内唯一 |
| `external_user` | 外部用户(客户/供应商) | `org_id`,email 表内唯一 |
| `role` | 角色字典(共用) | `scope` INTERNAL/EXTERNAL;唯一(scope,code) |
| `user_role` | 用户↔角色(多对多,共用) | 唯一(user_id,role_id);user_id 指 ops/external |
| `app_setting` | 全局业务配置 KV | `config_key` 唯一,`config_value` jsonb |
| `dict` | 数据字典/选项主数据 | 唯一(type,code);`names` jsonb 多语 |

- 无外键,关联裸 uuid + 显式索引(§4)。继承 BaseEntity 的表带 `version`。
- 受众(客户/供应商/内部)是结构性的(在哪张用户表 + org.type),不做成角色行 —— 改数据不能跨端。
- `role`/`user_role` 共用后,"外部人拿不到内部角色"由 service 校验 scope 一致来保证(§3 完整性在 service 层)。
- `key`/`value` 是 SQL 保留字 → `config_key`/`config_value`(§4)。

## 实体(7 个,`platform/identity` · `platform/config` · `platform/dict`)

Organization / OpsUser / ExternalUser / Role / UserRole / AppSetting / Dict —— 均继承 BaseEntity。
枚举用 `@Enumerated(STRING)`;uuid 列钉 `@JdbcTypeCode(SqlTypes.UUID)`;jsonb 用
`@JdbcTypeCode(SqlTypes.JSON)` + `columnDefinition="jsonb"`(§4 三个坑)。

**本轮只到实体。** repository / ConfigService / DictService / 种子数据、以及登录接口都还没做。
角色和字典的具体值也没种(避免凭空造,§4/C5),由后续按业务定义。

## 验证(跑过)

- **真库 validate 启动**:空库 → 迁移执行器应用全部迁移(schema_migrations 记到 `_04`)→ JPA validate
  通过 → `Started MfgApplication`。证明 7 个实体与迁移 schema 逐列对齐、零漂移。
- `schema.sql` 重放迁移重新生成 → 7 表 0 外键。
- `mvn verify` 绿(单测 16 + 集成 18,S3/AI 4 skip),create-drop 测试 profile 也能从实体建表启动。

## 部署清单

- 一个新迁移,开机自动应用(建 7 张表,秒级)。向后兼容:纯新增,旧 jar 不受影响。
