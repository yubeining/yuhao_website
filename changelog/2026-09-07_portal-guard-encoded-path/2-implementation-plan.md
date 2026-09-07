# 实施计划 —— 端级闸门改用解码路径

> 2026-09-07 ｜ 动手前对齐

## 必须做

1. 新增 `common/security/RequestPaths`：从 DispatcherServlet 已解析的 `RequestPath` 取解码后的
   应用内路径（每段 `PathSegment.valueToMatch()`，即 handler 映射用的值），剥 API 前缀，取第一段。
2. `PortalGuardInterceptor` 与 `AccessInterceptor` 都改走它，删掉各自基于 `getRequestURI()` 的私有方法。
3. `PortalGuardIT`（真 Tomcat + 真 PG + 真 Redis，`RANDOM_PORT` + `TestRestTemplate`，
   请求用 `URI` 对象发以免模板再编码）：本端 200 / 他端 403 / 编码他端 403 / 编码本端 200 / 无 token 401。
4. `AccessInterceptorTest`（单测，mock 授权表）：编码路径解析成登记的 resource key；
   GET → READ、POST → WRITE；非 ops 不管辖。
5. `application-test.yml` 的库/Redis 地址加 `${TEST_DB_URL}` / `${TEST_REDIS_HOST}` / `${TEST_REDIS_PORT}`
   环境变量覆盖，默认值保持 CI 形状不变 —— 本机 5432/6379 被别的实例占着，否则 `mvn verify` 跑不了。

## 被否决的方案

| 方案 | 为什么不 |
|---|---|
| 在拦截器里 `URLDecoder.decode(getRequestURI())` | 自己再解一遍和容器/MVC 的解码规则未必一致（`+`、`%2F`、矩阵变量），两套规则等于又留了缝 |
| 收紧 `StrictHttpFirewall`，拒绝一切 `%` | 合法的编码（中文文件名、空格）会被误杀；而且这是把闸门的正确性寄托在另一层的配置上 |
| 用 `@PreAuthorize` 按端注解 controller | 违反 CLAUDE.md §3「路由表 + 拦截器、零注解」；每个新端点都可能漏 |
| 只用 MockMvc 写测试 | MockMvc 不经过 Tomcat 的 URI 处理，测不到"容器解码后拦截器看到什么"这一层，正是本 bug 所在 |

## 风险

- `ServletRequestPathUtils.getParsedRequestPath` 依赖 DispatcherServlet 已缓存 `RequestPath`。
  拦截器跑在 handler 映射之后，一定已缓存；仍加了 `hasParsedRequestPath` 兜底走 `parseAndCache`。
- 测试 profile 用 JPA `create-drop` 建表，`access_grant` 没有实体 → 表不存在。
  所以 AccessInterceptor 的用例放单测（mock 授权表），不放 IT。这是测试 profile 的既有限制，本次不动。

## 不做

- 不改 `RouteAccessRegistry` 的路由表（G1 形状，按 D10～D19 重画是另一件事）。
- 不动 `domain/`。
