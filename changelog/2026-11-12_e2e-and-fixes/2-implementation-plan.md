# 实施计划 —— E2E 与两个修复（2026-11-12）

## 为什么这些 bug 单测抓不到

两个问题都只在「真实浏览器 + 真实多端切换」下才暴露：

| 问题 | 为什么单测看不见 |
|---|---|
| 运营端改语言 403 | 单测直接调 service，不经过端级闸门；前端调错路径只有浏览器里才发生 |
| memory 存储上传失败 | `*IT` 里上传走的是后端 `put()`，根本不经过浏览器那一跳的预签名 URL |

这正是要跑 E2E 的理由：**它测的是"组件之间没接上"，而不是"每个组件自己对不对"**。

## 修复 1：本地内存存储的上传/下载

**现象**：`provider=memory` 时预签名 URL 是 `memory:///put/...`，浏览器发不出去（还被 CSP 拦）。
后果不只是"上传失败"—— **提交订单要求每个零件至少一份图纸**，所以本地用 memory 存储根本走不完一条单。

**改法**：memory 实现把签名 URL 换成本应用的**同源一次性**地址 `/api/v1/dev/storage/{token}`，
由 `DevStorageController` 接住 PUT/GET 转给内存仓。token 随机、一次性、带过期、按操作类型隔离。

**边界**：
- 控制器 `@ConditionalOnProperty(provider=memory)` —— 生产用 s3 时这些路径是 404
- `SecurityConfig` 里对这几条路径 permitAll 也是**同样的条件**（`if (devStorageEnabled)`），
  不是为了省事；预签名 URL 的性质就是"不带登录态"，下载走 `window.location.assign` 没有 Authorization 头
- 字节仍然只在本进程内存里，不落盘、不跨实例

## 修复 2：运营端语言偏好

**现象**：`PATCH /api/v1/customer/me/locale` → 403 `common.wrong_portal`；运营在后台切语言，
界面变了但**一次都没存下来**，下次登录又变回去。

**两个原因同时存在**：
1. 前端按 `partyType` 二选一（SUPPLIER 走 supplier，其余全走 customer）—— OPERATOR 被送到客户端的路径
2. 后端 `MeLocaleController` 只映射了 `/customer` 和 `/supplier`，**没有 `/ops`**；
   而且 `AuthService.updateLocale` 只更新 `external_user`，运营账号在 `ops_user` 表里

**改法**：三处一起补 —— 后端加 `/ops/me/locale`、`updateLocale` 兼容 ops_user、前端改成按 partyType 查表。

## 被否决的方案

- **给 memory 存储保留 `memory://` 但前端加特判**：等于把"本地实现是假的"写进产品代码
- **为 E2E 加一个 dev-only 的"直接上传"端点绕开预签名**：那样验的就不是真实链路了
- **把 E2E 塞进 `portal/`**：它同时跨三端 + 需要独立数据库，和前端工程不是一回事

## 风险

`DevStorageController` 是一个**不带认证的写入口**。它只在 memory 模式下注册，而 memory 模式
本来的定位就是"本地/测试"。要上生产必须用 s3（`app.storage.provider` 默认就是 s3），
那时这个 bean 和对应的 permitAll 都不存在。
