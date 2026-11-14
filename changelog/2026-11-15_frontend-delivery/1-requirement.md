# 需求 —— 前端性能优化（2026-11-15）

> 需求原话：「前端进行性能优化」

## 实测现状（改之前，线上 partcut.com）

| 项 | 实测 | 问题 |
|---|---|---|
| gzip/br | 带 `Accept-Encoding` 仍返回 480,583 字节原文 | 白传 ~340KB |
| 缓存头 | `/assets/**` 也是 `no-store` | 每次访问重新下载 |
| sourcemap | `index-*.js.map` 公开可下载，2,214,292 字节 | 源码泄露 + 镜像变大 |
| 拆包 | 单包 480KB | 首屏等整包 |

## 验收

- 构建产物按 gzip 传输
- `/assets/**` 返回一年期 immutable 缓存，二次访问 0 字节
- 不再产出/暴露 sourcemap
- SPA 路由与 API 仍为 no-store
