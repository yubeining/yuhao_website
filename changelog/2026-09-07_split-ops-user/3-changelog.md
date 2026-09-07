# 变更记录 —— 内部/外部用户拆两张表

> 2026-09-07 ｜ Schema + 平台实体 ｜ `domain/` 未动

## Schema（新迁移，破坏性但库空、安全）

`database/migrations/2026-09-07_01_split-ops-user.sql`：

- **新建 `ops_user`**（运营员工）：email / wework_id / display_name / password_hash / status /
  last_login_at + BaseEntity 的 id/时间戳。裸 uuid、显式唯一索引（email、wework_id），**不建外键**。
  email/wework_id 唯一性只在运营命名空间内。
- **`access_grant`**：删存量两个外键（`_user_id_fkey` / `_granted_by_user_id_fkey`），
  user_id 语义改为 ops_user id（内部 RBAC 主体）。
- **`party.type` CHECK 收紧**到 {CUSTOMER, SUPPLIER}（去掉 OPERATOR）；补表注释说明 party/party_user 只装外部。

## 代码

- `platform/auth/OpsUser`（**首个继承 `BaseEntity` 的实体**）+ `OpsUserRepository`
  （findByEmailIgnoreCase / findByWeworkId，登录时用）。
- 鉴权底座（`PortalGuard` / `partyType` / 路径前缀 / `UserPrincipal`）**未改** —— 拆分只动数据层。

## 验证（真跑过）

真库 validate 模式启动（docker mfg，这是 BaseEntity 第一次被真实 schema 校验）：

```
applying migration: 2026-09-07_01_split-ops-user.sql
applied 1 migration(s), 6 total on record
Started MfgApplication ... health: {"status":"UP"}
```

psql 核对：
```
ops_user 表 9 列齐；索引 ops_user_pkey / ops_user_email_uk / ops_user_wework_uk
party_type_chk = CHECK (type = ANY ('CUSTOMER','SUPPLIER'))     ← OPERATOR 已去
access_grant 外键：无                                            ← 已删
```

全套测试绿（create-drop 从实体建 ops_user + 全上下文启动）：
`AccessInterceptorTest 4 / MemoryStorageServiceTest 5 / PortalGuardIT 7`，BUILD SUCCESS。

## 部署清单

- 一个新迁移，开机自动应用（库空，秒级）。回滚 jar 不回滚库：v1 代码面对新 schema 能跑
  —— 它不 INSERT party、不碰 ops_user，party.type 收紧对它无影响（扩展-收缩判据通过）。

## 遗留项 / 边界

| # | 事项 |
|---|---|
| 1 | D20（一人可多方）未做：`party_user` 仍一人一 party，membership 多对多留到外部登录 |
| 2 | `UserPrincipal.partyId` 运营应可空 + 按 partyType 查不同表 —— 真实登录时改 |
| 3 | 真实登录（运营企微/邮箱、外部邮箱/手机）仍未做，`DevAuthController` 仍是后门 |
| 4 | Q18：其余存量外键（part_file / file_access_log / audit_event 等）仍与 §4 冲突，待统一清理 |
| 5 | `database/schema.sql` 项目从未创建；迁移是唯一真源 |
