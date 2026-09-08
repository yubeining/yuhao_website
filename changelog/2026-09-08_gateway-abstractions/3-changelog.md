# 变更记录 —— 业务网关抽象 + 统一请求上下文

> 2026-09-08 ｜ 平台层重构 + 新增 ｜ 无 schema、无 domain

## 背景

业务网关 = 应用内的过滤器/拦截器链（RequestTraceFilter → JwtAuthFilter → Security →
PortalGuard → AccessInterceptor → controller → ResponseWrapper → GlobalExceptionHandler）。
本轮做「架构层面的优化」：把链路上重复的读取逻辑收敛成公共门面，再把散落的限流下沉成声明式注解。
纯重构 + 一个新注解，运行时行为不变（除限流从命令式改声明式，语义等价）。

## P2 —— 统一读「principal / 上下文」，消除重复

- 新增 `common/security/AuthContext`：唯一的 principal 读取口。
  `currentPrincipal()` / `current()`（Optional）—— 真源是 Spring Security 的 SecurityContext。
- **删掉 5 处各自手写的 `currentPrincipal()`**（同一段 `SecurityContextHolder.getAuthentication()...instanceof`
  拷贝了五份），全部改调 `AuthContext.currentPrincipal()`：
  `PortalGuardInterceptor` / `AccessInterceptor` / `AuditLogAspect` /
  `CurrentUserArgumentResolver` / `CurrentPartyArgumentResolver`。
- 新增 `common/web/RequestContext`：请求级上下文的**统一门面**。
  - `traceId()` / `clientIp()` / `clientIpHash()`：来自一个 ThreadLocal，由 `RequestTraceFilter`
    在请求入口 `begin(...)`、`finally` 里 `clear()`。服务层不用把 `HttpServletRequest` 层层下传也能拿到。
  - `principal()` / `userId()` / `portal()`：**不复制**，实时委托 `AuthContext`（避免两份登录态漂移）。
- 新增 `common/web/ClientIp`：取真实客户端 IP（istio 后取 XFF 最左跳）；`hashed()` / `hash()`
  出短 sha256，落限流 key / 审计用，**不落原始 IP**（§6/§7）。
- 新增 `common/web/MdcKeys`：MDC 键常量（traceId / userId / portal），消除散落的字符串字面量。
- 新增 `observability/MdcUserContextInterceptor`：认证后把 userId/portal 补进 MDC；
  在 `WebMvcConfig` 里 order(0) 注册（早于 portalGuard(1)/access(2)），后续闸门日志也带上人。
- `application.yml` 日志 correlation pattern：`[%X{traceId} %X{userId} %X{portal}]` ——
  每行日志带上「哪条请求、谁、哪个端」。

## P1 —— 声明式限流 `@RateLimit`

- 新增 `platform/ratelimit/RateLimit` 注解 + `RateLimitAspect` 切面（和 `@Idempotent` 同一种风格）：
  - `scope`（被限动作）+ `key`（SpEL 求主体；留空 → 客户端 IP hash）+ `limit` / `windowSeconds`
    （支持 `${...}` 配置占位符，阈值走环境变量不写死）+ `message`。
  - 底层仍是 `common/service/RateLimiter`（Redis 固定窗口 + fail-open），切面只负责「凑参数」。
- `LoginController.login`：把方法体第一行的命令式 `rateLimiter.enforce("login", 端+账号, ...)`
  提到签名上的 `@RateLimit(scope="login", key="#request.portalType + ':' + #request.account.toLowerCase()",
  limit="${app.auth.login.max-attempts}", windowSeconds="${app.auth.login.window-seconds}")`。
  控制器随之瘦身：不再注入 `RateLimiter` / `AppProperties`，准入规则一眼可见。

## 验证（跑过，真 Postgres + Redis）

```
RateLimitAspectIT  Tests run: 2  ← 到上限即拒(2次放行第3次429)/不同subject独立 · 占位符阈值从配置解析(默认10)
ArchitectureTest   6 绿 · IdempotencyAspectIT 2 · PortalGuardIT 7 · RateLimiterIT 3 · OptimisticLockingIT 2
全套 mvn verify     单测 27 + 集成 23（S3/AI 4 例因无真实凭证 skip），BUILD SUCCESS
```

## 部署清单

- 无迁移、无新配置。合并即生效。登录限流行为与之前**等价**（同 key、同阈值、同 429），只是从代码改成注解。

## 遗留项

- 公开留资 / 其他易被刷的端点做时，直接标 `@RateLimit`（`key` 留空即按来源 IP 限）。
- 服务层要拿 traceId / 客户端 IP，统一走 `RequestContext`，不再碰 `MDC` / `HttpServletRequest`。
