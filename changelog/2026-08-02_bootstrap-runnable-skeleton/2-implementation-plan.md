# 实施计划

## 后端：补齐装配层

| 文件 | 职责 |
|---|---|
| `MfgApplication` | 入口，`@EnableScheduling` |
| `config/WebMvcConfig` | API 前缀 + 拦截器链 + 参数解析器 |
| `config/SecurityConfig` | 只回答「要不要登录」这一个问题 |
| `config/SpaForwardController` | 前端路由 forward 到 `index.html` |
| `platform/auth/JwtService` | 签发/解析，`sub` 解析成 `UUID` |
| `platform/auth/JwtAuthFilter` | 还原 principal，**不做拒绝** |
| `common/security/Current*ArgumentResolver` | 解析两个注解 |
| `platform/access/AccessInterceptor` + `AccessGrantRepository` | ops 端资源级鉴权 |
| `platform/dbmigration/SchemaMigrationJpaDependencyConfig` | 迁移先于 JPA 初始化 |

### 三个关键取舍

**1. API 前缀只加给 `@RestController`**

用 `HandlerTypePredicate.forAnnotation(RestController.class)`。
`SpaForwardController` 是 `@Controller`，因此不被套前缀 ——
否则 `/customer/**` 变成 `/api/v1/customer/**`，SPA 直接白屏。

**2. 两个拦截器只挂在 `apiPrefix + "/**"` 下**

不能挂 `/**`。前后端同一个部署单元之后，浏览器请求 `/customer/rfqs`
要的是 HTML 外壳而不是 JSON，挂全局的话会被端级闸门当成 API 调用拒掉，
未登录用户连登录页都打不开。

**3. `@CurrentParty` 拿不到 principal 时抛异常，`@CurrentUser` 返回 null**

不对称是刻意的。`partyId` 是所有租户隔离查询的入参，
一旦是 `null`，`findByIdAndPartyId(id, null)` 会静默返回空 ——
表现为「数据不见了」而不是「你没登录」，排查方向从一开始就错。
更坏的是某个 service 把 null 当「不限制」处理，那就是越权。

## 前端：Vite + React SPA

- `middleware.ts` → `components/PortalGuard.tsx`，语义不变（仍然只是体验层）
- `next-auth` → `auth/session.ts` + `useSyncExternalStore`
- `http.ts` 保留全部注释和 C1 纪律，只换掉 next-auth 依赖
- `build.outDir` 指向 `backend/src/main/resources/static/`

## 被否决的方案

**① 保留 Next.js，云上两个容器 + 网关分流。**
否决理由：用户明确要「前后端在一起」。而且本系统没有页面需要 SSR，
为一个用不上的能力付出两个容器 + 一套跨域配置的代价不划算。

**② Spring Boot 用 catch-all（`/**`）forward 到 index.html。**
否决理由：打错字的 API 路径会返回 200 + 一坨 HTML，
前端 `response.json()` 抛 `common.malformed_response`，
而真实原因是 404 —— 能白白烧掉半天。改成显式列举一级路由前缀。
代价是新增端要改两处，但一级路由几年不会新增，路径打错是每天都发生的事。

**③ dev-login 默认开启，方便开发。**
否决理由：任何人 POST 一下就能拿 OPERATOR token。
改成 `@ConditionalOnProperty` 默认 false —— 关闭时 bean 根本不存在，路径 404。

## 顺带要修的既有缺陷

1. `ResponseWrapperAdvice` 把 `GlobalExceptionHandler` 的响应包了两层
2. `GlobalExceptionHandler` 没处理 `NoResourceFoundException` → 所有 404 变 500
3. `pom.xml` 缺 actuator 依赖，但 yml 和 SecurityConfig 都假设它在
4. `http.ts` 的 `requestBinary` 漏解构 `body`，类型不通过
5. `check-non-ascii-literals.py` 误杀 Javadoc 里的中文
6. `docker-compose.yml` 端口写死
