# 需求 —— 限流 / 防刷

> 提出日期：2026-09-07 ｜ 提出人：项目负责人

## 原话

> 「把限流搭了」

## 背景

公开端点（官网留资）和登录一旦上线，就是被刷/被爆破的目标，现在零防护。
`RedisService.increment`（只在计数为 1 时设 TTL）早就建好，正是给固定窗口限流准备的，
但一直没人用。`CacheKeys.publicRateLimit` 也已存在。

## 验收

1. 一个可复用的限流服务，调用方给 动作 + 主体 + 限额 + 窗口即可。
2. 登录按邮箱、留资按 ipHash 这类"按主体计数"的用法直接支持。
3. 超限能一行抛 429（i18n code），也能返 boolean 由调用方决定。
4. Redis 抖动时 fail-open（放行 + 记 warn），不因非核心组件拦死正常请求。
5. 对真实 Redis 有测试（§9 不 mock 缓存）。

## 关联

- `CLAUDE.md` §7（Redis）、§9（IT 用真 Redis）
- 复用：`RedisService.increment`、`CacheKeys.rateLimit`
- 用它的地方（后续）：真实登录（防爆破）、公开留资端点（防刷）
