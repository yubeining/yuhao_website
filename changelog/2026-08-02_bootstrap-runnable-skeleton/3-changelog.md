# 变更记录 —— 骨架转为可运行

## 新增

**后端（11 个文件）**

```
com/mfg/MfgApplication.java
com/mfg/config/WebMvcConfig.java
com/mfg/config/SecurityConfig.java
com/mfg/config/SpaForwardController.java
com/mfg/common/security/CurrentUserArgumentResolver.java
com/mfg/common/security/CurrentPartyArgumentResolver.java
com/mfg/platform/auth/JwtService.java
com/mfg/platform/auth/JwtAuthFilter.java
com/mfg/platform/auth/WhoAmIController.java
com/mfg/platform/auth/DevAuthController.java        ← ★ 后门，默认关闭，上线前删
com/mfg/platform/access/AccessInterceptor.java
com/mfg/platform/access/AccessGrantRepository.java
com/mfg/platform/dbmigration/SchemaMigrationJpaDependencyConfig.java
com/mfg/platform/health/HealthController.java
```

`platform/health/` 是新开的包。它没有业务语义（只有一个 `/public/ping`），
按 CLAUDE.md §4 归 `platform/` 无歧义。

**前端**：`portal/` 从 2 个文件变成完整的 Vite + React 应用（17 个源文件）。

**配置**：`.env.example`、`changelog/2026-08-02_bootstrap-runnable-skeleton/`

## 修复既有缺陷

| # | 文件 | 问题 | 影响 |
|---|---|---|---|
| 1 | `ResponseWrapperAdvice` | `supports()` 只看静态返回类型，认不出 `ResponseEntity<ApiResponse<T>>` 里已经是 envelope | 异常响应被包两层，`{"code":200,...,"data":{"code":500,...}}`。**HTTP 是 500 但 envelope 里的 code 是 200，前端会当成功处理** |
| 2 | `GlobalExceptionHandler` | 没有 `NoResourceFoundException` handler | **所有 404 变 500**，并打整条栈。真 500 被淹没，告警失效 |
| 3 | `pom.xml` | 缺 `spring-boot-starter-actuator` | `/actuator/health` 是 404。云平台探针会判定实例不健康并无限重启，日志里看不到任何异常 |
| 4 | `portal/.../http.ts` | `requestBinary` 没把 `body` 从 `...rest` 解构出去 | `tsc` 报 TS2345。原项目从未跑过 `tsc`，所以一直没暴露 |
| 5 | `scripts/check-non-ascii-literals.py` | 只剥 `//`，不认 `/* */` | Javadoc 里用半角引号的中文被误判为字符串字面量（存量代码 8 处）。**闸门误杀会逼人用 `--no-verify`，而那是唯一一条不可放松的规则** |
| 6 | `docker-compose.yml` | 宿主机端口写死 | 见下 |

### 关于 #6

macOS 上 brew 的 postgres 绑 `127.0.0.1:5432`、docker 绑 `*:5432`，
两者能同时启动、`docker ps` 显示一切正常，但 `localhost:5432` 优先命中 brew 那个。
应用报 `role "mfg" does not exist` —— 看起来像初始化脚本没跑，实际是连错了库。

改成 `${POSTGRES_PORT:-5432}`，撞车时改 `.env` 即可。

## 删除

- `portal/src/middleware.ts` —— 由 `components/PortalGuard.tsx` 取代
- `portal/src/app/`、`portal/src/lib/` —— Next.js App Router 的空目录
- `scripts/__pycache__/`、若干 `.DS_Store`（并加进 `.gitignore`）

## 文档同步

- `CLAUDE.md` §2 技术栈、§4 前端目录、§13 开发环境
- `README.md` 整体重写，补「已完成 / 未完成」清单

## 验证输出

```
$ mvn spring-boot:run
SchemaMigrationRunner : applying migration: 2026-08-02_01_platform-core.sql
SchemaMigrationRunner : applying migration: 2026-08-02_02_part-and-drawing.sql
SchemaMigrationRunner : applying migration: 2026-08-02_03_rfq-and-sourcing.sql
SchemaMigrationRunner : applying migration: 2026-08-02_04_pricing-quote-order.sql
SchemaMigrationRunner : applied 4 migration(s), 4 total on record
Started MfgApplication in 2.375 seconds

# 二次启动 —— 幂等 + 内容 hash 未漂移
SchemaMigrationRunner : schema up to date, 4 migration(s) on record

$ psql -tAc "select count(*) from information_schema.tables
             where table_schema='public' and table_type='BASE TABLE'"
31

$ curl /api/v1/public/ping
{"code":200,"message":"ok","data":{"service":"mfg-backend","serverTime":"..."}}

$ curl /actuator/health
{"status":"UP"}

$ curl /api/v1/public/typo
HTTP 404  {"code":404,"message":"common.not_found"}

# 端级隔离：CUSTOMER token 敲三个端
/customer/whoami → 200 {"partyType":"CUSTOMER",...}
/supplier/whoami → 403 {"code":403,"message":"common.wrong_portal"}
/ops/whoami      → 403 {"code":403,"message":"common.wrong_portal"}

# SPA 托管
/               → 200 text/html
/customer/rfqs  → 200 text/html
/ops/dashboard  → 200 text/html
/nope           → 404 application/json     ← 没被 catch-all 吞掉

# 拆单不变式触发器（order_line qty=100）
分配 60  → OK，视图显示 unallocated_qty=40
再分配 50 → ERROR: ALLOCATION_EXCEEDS_ORDER_LINE_QTY

$ npm run build
tsc -b && vite build  → ✓ built in 781ms
```

## 部署清单

- [ ] `JWT_SECRET` 走 Secret Manager，**不与任何其他环境共用**
- [ ] `DEV_LOGIN_ENABLED` 确认为 `false`（默认就是）
- [ ] `DB_URL` / `DB_PASSWORD` / `REDIS_HOST` 走环境变量
- [ ] 健康探针指向 `/actuator/health`
- [ ] 构建顺序：`npm run build` 必须先于 `mvn package`

## 遗留项

**必须在下一阶段处理**

1. **删掉 `DevAuthController`** —— 和真实登录同一个 PR
2. **`session.ts` 用 localStorage 存 token，上线前重新评估**
   —— 换 httpOnly cookie 时后端要同步加 CSRF，两件事必须同一个 PR
3. **`RouteAccessRegistry` / `AccessInterceptor` 未注册路径当前放行**
   —— ops 端点登记完之后改成默认拒绝
4. **仓库还不是 git 仓库**（没有 `.git`），所以 `.githooks/`、
   `setup-hooks.sh`、提交闸门、PR 模板全部处于未激活状态。
   `git init` 之后第一件事是跑 `./scripts/setup-hooks.sh`
5. **零测试**。CLAUDE.md §10 要求「每个供应商端端点必须有负向测试」，
   现在连测试基类都没有

**不阻塞**

- `site/`（官网）仍是空目录
- 没有 Dockerfile
- `jackson-datatype-hibernate6` 依赖目前用不上（只返 DTO，不序列化实体），
  但按「依赖配置按项目来」保留
