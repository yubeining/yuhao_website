# 变更记录 —— 前端交付优化（2026-11-15）

## 改动

1. **开启 gzip 压缩**（`server.compression`）
   - ★ MIME 必须写 `text/javascript`：Spring 6 给 `.js` 的就是它，
     写 `application/javascript` 看起来生效、实际不压（本次踩到）
2. **静态资源长缓存**：新增 `StaticCacheFilter`
   - `/assets/**` → `public, max-age=31536000, immutable`（文件名带内容 hash）
   - `/api/**`、`/actuator/**`、SPA 路由 → `no-store`
   - 用 Filter 而不是改 Security：Security 的 header writer 在进链前写头，
     Filter 在其后覆盖，不必关掉 Security 的默认 no-store
3. **关闭 sourcemap**：`vite.config.ts` `sourcemap: false`

## 实测结果（本机 Chrome，真实加载）

| 指标 | 改前 | 改后 |
|---|---|---|
| JS 传输 | 480,583 B | **142,826 B**（gzip） |
| CSS 传输 | 36,564 B | **7,831 B**（gzip） |
| 首屏合计 | ~517 KB | **150,657 B** |
| 二次访问 | 重新下载 | **0 B**（immutable 命中） |
| 公开 sourcemap | 2.2 MB | 不产出 |

## 验证

- `curl -H 'Accept-Encoding: gzip'` → `Content-Encoding: gzip`，142,526 B
- `/assets/*.js` → `Cache-Control: public, max-age=31536000, immutable`
- `/customer/orders`（SPA 外壳）→ `no-store`
- `/api/v1/public/ping` → `no-store`
- Playwright：首次 150,657 B，reload 后 0 B

## 没做的事（以及为什么）

- **按路由拆包**：首屏压缩后 150KB，二次访问 0 字节，收益已经不大；
  拆包会让首次进入某个端多一次 chunk 下载 + 一个 spinner，
  反而加重「跳转慢」的感知。等首屏回到几百 KB 再说。
- **Brotli**：Tomcat 不内置，要加前端压缩或网关承担；当前 gzip 已经够。
