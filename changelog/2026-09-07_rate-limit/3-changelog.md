# 变更记录 —— 限流 / 防刷

> 2026-09-07 ｜ 平台层新增 ｜ 无 schema、无 domain

## 为什么没有 2-implementation-plan.md

单一机制，方案在需求里已明（固定窗口、显式 key、fail-open、429）。diff 看「为什么」不留疑问。

## 新增

- `common/service/RateLimiter`：
  - `tryAcquire(scope, subject, limit, window)` → boolean
  - `enforce(scope, subject, limit, window)` → 超限抛 `BusinessException(429, "common.rate_limited")`
  - 固定窗口，基于 `RedisService.increment`（计数为 1 时设 TTL）
  - Redis 不可用 → fail-open（放行 + warn）
- `common/cache/CacheKeys.rateLimit(scope, subject)`：通用限流 key（原来只有按 IP 的 `publicRateLimit`）

## 说明

- **固定窗口**：窗口交界可能短时突发。对防爆破/防滥用足够；要严格平滑再上滑动窗口/令牌桶。
- **fail-open**：限流是锦上添花，不该因 Redis 抖动拦死登录。真正不能失守的一致性（如接单唯一）
  靠 DB 唯一约束，不靠限流。
- 现在只是服务就位，**还没挂到任何端点** —— 真实登录 / 公开留资端点做时用 `enforce`/`tryAcquire`。

## 验证（跑过，真 Redis）

```
RateLimiterIT   Tests run: 3   ← 限额边界(3次放行第4次拒) / 不同主体独立 / enforce 超限抛 429
全套            Access 4 / Memory 5 / Notification 5 / PortalGuard 7 全绿，BUILD SUCCESS
```

## 部署清单

- 无迁移、无新配置。合并即生效（但未挂端点，运行时无行为变化）。
