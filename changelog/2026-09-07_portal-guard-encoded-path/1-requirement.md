# 需求 —— 端级闸门被 URL 编码绕过

> 提出日期：2026-09-07 ｜ 来源：开写后端前的架构审查，实测发现 ｜ 授权：「修」

## 原话

审查报告给出后：

> 「修 都写进文档」

## 背景

`PortalGuardInterceptor` 是本系统"第一道、也是最重要的一道拦截器"（类注释原话）：
URL 路径前缀即受众，`/customer/**` 只放 CUSTOMER、`/supplier/**` 只放 SUPPLIER、`/ops/**` 只放 OPERATOR。

审查时用现有 jar（`backend/target/`，2026-08-03 构建，闸门代码与当前一致）在 docker 里跑起来，
拿 CUSTOMER 的 dev-login token 实测：

```
GET /api/v1/ops/whoami        → 403 {"message":"common.wrong_portal"}   闸门工作
GET /api/v1/%6fps/whoami      → 200 {"partyType":"CUSTOMER",...}       进了 ops 的 handler
GET /api/v1/%73upplier/whoami → 200                                    进了 supplier 的 handler
GET /api/v1/%6fps/whoami（无 token）→ 401                                认证层没问题，只是闸门
```

原因：两个拦截器都用 `request.getRequestURI()` 判断路径。它是原始、未解码的 URI，
`%6fps` 不等于 `ops` 于是放行；而 Spring MVC 按解码后的路径匹配 controller，请求照样落进 `/ops/**`。
`AccessInterceptor`（ops 内部细粒度权限）同一个写法：编码后的路径在路由表里什么都匹配不上，
走"未注册 = 放行"。

这是 `CLAUDE.md` §3 红线 2 那一类：客户 token 能打到供应商端和 ops 端的任何接口。

## 验收

1. CUSTOMER / SUPPLIER token 以任何 URL 编码形式访问他端，一律 403 `common.wrong_portal`；
2. 编码后解析为本端的路径不误伤（`/%63ustomer/whoami` 对 CUSTOMER 仍 200）；
3. ops 端非 ADMIN 用编码路径访问已登记资源，按解码后的 resource key 查授权，不再放行；
4. 上述全部有测试：集成测试走真实 Tomcat（MockMvc 测不到容器解码这一层）；
5. 修复前测试必须失败，修复后全绿 —— 两个结果都要贴出来。

## 关联

- `docs/design/11` §2「审查中发现并已修复的安全缺陷」
- `CLAUDE.md` §3 受众级硬闸门、§9 测试
