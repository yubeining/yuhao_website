# 变更记录 —— identity 域(repo/service/三端 controller)+ 注册 + 登录

> 2026-09-08 ｜ 无 schema(表已在 04)｜ 平台层 identity + auth

## 做了什么

给 identity 域(组织/用户)补齐 repository → service → 三端 controller,并做注册 + 登录。

### 数据层
- 5 个 repository:Organization / OpsUser / ExternalUser / Role / UserRole。

### 服务层
- `IdentityService`:注册(建组织 + 首个用户)、列组织、查组织、列本公司成员(带 orgId 条件,§5)。
- `AuthService`:内部走 ops_user、外部走 external_user,**各查各表**;失败一律 `auth.bad_credentials`
  (防账号枚举);外部还要核对 portalType 与 org.type 一致;角色从 user_role→role.code 取。
- `RefreshTokenService`:重建(Redis 不透明串,可轮换/撤销;wipe 时删过)。
- `AuthTokenIssuer`:把认证结果签成 access(JWT)+ refresh —— 两个登录控制器共用(组合,不用基类)。

### 认证(内外两条独立 URL,页面不混)
- **外部** `ExternalAuthController @ /auth`:`register` / `login`(portalType∈{CUSTOMER,SUPPLIER},
  传 OPERATOR 直接 400)/ `refresh` / `logout`。注册按 IP 限流、登录按(端+账号)限流。
- **内部** `OpsAuthController @ /auth/internal`:`login`(恒 OPERATOR,无 portalType)/ `refresh` / `logout`,
  **无注册**。两侧 refresh 互不接受对方的 token(不混用)。

### 三端只读接口
- `/ops/organizations`(分页列 + 取一个):运营浏览全部组织。
- `/customer|/supplier/organization` + `/…/organization/members`:外部看**自己公司**+ 本公司成员,
  orgId 来自 `@CurrentParty`(principal),不来自路径 —— 租户隔离(§3/§5),客户只能看到自己那家。

### DTO(白名单序列化 §5)
- `OrganizationView` / `UserView`(**不含 password_hash**)/ `RegisterRequest`(服务端字段不收)。

### 顺带修复
- `PagedResponse.of(page, mapper)` 的 page 也改成 **1-based**(上一批只改了无 mapper 的重载,
  控制器用的正是 mapper 版,导致 page 返 0)。

## 明确不做(§4/C5)
- 角色**未种**(取值待定);客户/供应商端建/改/停用用户(邀请流程,缓办);组织 KYC/入驻;ops 写操作。

## 验证(真 Tomcat + 真库 + 真 Redis)
- `AuthFlowIT`(4):注册→登录→读自己公司+成员(page 1-based、total 1);客户 token 打供应商端 403;
  内部 `/auth/internal/login` 登录→列组织;外部 login 传 OPERATOR 被 400。
- 全套 `mvn verify` 绿:单测 21 + 集成 22(S3/AI 4 skip),BUILD SUCCESS。

## 部署清单
- 无迁移。`/auth/**` 公开;三端接口需 JWT + 过端级闸门。生产登录恢复(注册→登录跑通)。
