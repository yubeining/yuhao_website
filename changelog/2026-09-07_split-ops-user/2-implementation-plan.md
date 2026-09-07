# 实施计划 —— 内部/外部用户拆表

> 2026-09-07 ｜ 动手前对齐

## 必须做

1. 迁移 `2026-09-07_01_split-ops-user.sql`：
   - 建 `ops_user`（裸 uuid + 显式唯一索引，不建外键，§4）；
   - 删 `access_grant` 存量两个外键，其 user_id 语义改为 ops_user id；
   - `party.type` CHECK 收紧到 {CUSTOMER, SUPPLIER}（DROP IF EXISTS + ADD，重跑安全）。
2. `OpsUser`（继承 BaseEntity）+ `OpsUserRepository`。
3. 对真库 validate 模式启动，确认迁移应用 + schema 校验通过。

## 关键点与取舍

| 点 | 选择 | 为什么 |
|---|---|---|
| 外部合一张还是拆两张 | 外部（客户+供应商）**一张** | D20 一个外部用户可同时是客户+供应商，合一张自然 |
| D20 membership 这次做吗 | **不做** | 一次只解决内部/外部拆分；membership 多对多留到外部登录 |
| 存量外键怎么办 | 新表不建 + 删 access_grant 存量外键 | §4 禁止外键；删存量外键天然安全一次发布（§5）。给 Q18 打样 |
| 收紧 party.type CHECK | 直接收（DROP+ADD） | 库全空、无 OPERATOR 行、无业务代码 INSERT party，收紧无风险（§5） |
| `UserPrincipal.partyId` 可空 | **本次不动** | 运营无 partyId 是登录时才发生的事；DevAuthController 现仍给随机 id，改它属登录域 |
| status | JPA enum(STRING) | 类型安全，映射 text 列，validate 通过 |

## 被否决 / 不做

| 方案 | 为什么不 |
|---|---|
| 保持一张 party_user 靠 type 判别 | 隔离只是约定不是物理保证，email 共命名空间。用户明确要拆 |
| 拆三张（客户/供应商/运营各一张） | 和 D20 冲突（一人同时客户+供应商要在两表各建行） |
| 同时把登录、UserPrincipal 一起改 | 一次动太多；本次只动数据模型，登录单独做 |
| 建 database/schema.sql 同步 | 该文件项目从未创建（既有缺口），不在本次范围，迁移是真源 |

## 验证

- 真库（docker mfg，validate 模式）启动：迁移应用成功、Started、health UP。
- psql 核对：ops_user 表 + 两唯一索引、party_type_chk 只剩两值、access_grant 无外键。
- 全套测试（create-drop 从实体建 ops_user + 全上下文启动）绿。
