# 变更记录 —— 端级闸门改用解码路径

> 2026-09-07 ｜ 安全修复 ｜ 无 schema 变更 ｜ 无配置变更（测试 profile 加了可选环境变量）

## 安全修复

- `backend/src/main/java/com/mfg/common/security/RequestPaths.java` **新增**：
  解码后的应用内路径（剥 API 前缀）+ 取第一段。两个拦截器共用。
- `PortalGuardInterceptor`：`firstSegment(request.getRequestURI())` → `RequestPaths.firstSegment(decodedPathWithinApi(...))`；
  删私有 `firstSegment`。
- `AccessInterceptor`：`stripPrefix(request.getRequestURI())` → `RequestPaths.decodedPathWithinApi(...)`；删私有 `stripPrefix`。

## 测试

- `backend/src/test/java/com/mfg/common/security/PortalGuardIT.java` **新增**（7 例）
- `backend/src/test/java/com/mfg/platform/access/AccessInterceptorTest.java` **新增**（4 例）
- `backend/src/test/resources/application-test.yml`：库 URL / Redis host+port 加环境变量覆盖，默认值不变。

这是仓库里**第一个测试**（此前 `src/test/` 只有一个 yml）。

### 修复前（把两个拦截器 stash 回旧代码，测试文件保留）

```
[ERROR] Tests run: 7, Failures: 3, Errors: 0, Skipped: 0 -- in com.mfg.common.security.PortalGuardIT
[ERROR]   PortalGuardIT.fullyEncodedSegmentIsForbidden:98
[ERROR]   PortalGuardIT.percentEncodedFirstSegmentIsStillForbidden:79
[ERROR]   PortalGuardIT.percentEncodedSegmentFromSupplierSideIsForbiddenToo:90
[INFO] BUILD FAILURE
```

### 修复后

```
[INFO] Tests run: 4, Failures: 0, Errors: 0, Skipped: 0 -- in com.mfg.platform.access.AccessInterceptorTest
[INFO] Tests run: 7, Failures: 0, Errors: 0, Skipped: 0 -- in com.mfg.common.security.PortalGuardIT
[INFO] BUILD SUCCESS
```

本机命令（docker compose 的 postgres-test 在 5443、redis 在 6380）：

```
TEST_DB_URL=jdbc:postgresql://localhost:5443/mfg_test TEST_DB_PASSWORD=mfg TEST_REDIS_PORT=6380 mvn verify
```

CI 不用改：默认值仍是 5432 / 6379。

## 部署清单

- 无迁移、无开关。发布即生效。
- 线上目前只有 `whoami` 三个端点在闸门之后，没有业务数据 —— 本缺陷尚无实际泄露面，但下一个业务端点上线前必须先合这个。

## 遗留项

| # | 事项 |
|---|---|
| 1 | 测试 profile 用 JPA `create-drop`，无实体的表（`access_grant`）在 IT 里不存在。第一个真正打 ops 细粒度权限的 IT 出现时要么给它建实体，要么让测试 profile 跑真实迁移 |
| 2 | `RouteAccessRegistry` 未登记路径仍放行；路由表按 D10～D19 重画时一并改成拒绝 |
