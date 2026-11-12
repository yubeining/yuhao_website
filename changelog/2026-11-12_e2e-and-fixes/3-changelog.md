# 变更记录 —— E2E 与两个修复（2026-11-12）

## 验证（实跑）

```
mvn verify                   80 单测 + 149 集成，0 失败，5 跳过
npm run type-check           通过
npm run build                通过
e2e（memory 存储）            22/22 通过
e2e（s3-mock 存储）           22/22 通过
check-i18n-literals          通过
check-non-ascii-literals     通过
check-no-foreign-keys        通过
check-schema-sync            通过
check-hardcoded-api-prefix   通过
```

E2E 连跑三遍（一遍 s3-mock、两遍 memory）都是 22/22，库里终态一致：
`customer_order=READY` / `supplier_order=FULFILLED` / `ops_order=FULFILLED`。

## 一、新增 E2E（`e2e/`）

| 文件 | 作用 |
|---|---|
| `e2e/e2e-main.mjs` | 22 步主流程，每步截图，失败即停并写 `report.json` |
| `e2e/lib.mjs` | 会话/登录/截图助手；**显式 accept `window.confirm`**（Playwright 默认 dismiss，会让发报价、接单、禁用账号静默失效） |
| `e2e/seed-ops.sh` | 造第一个运营账号（系统没有这个入口） |
| `e2e/fixtures/part.pdf` | 上传用的最小合法 PDF |
| `e2e/README.md` | 前置、跑法、已知限制 |

不进仓库的：`shots/`、`report.json`、`node_modules/`（已 gitignore）。

## 二、修复：本地内存存储的上传/下载

**症状**：`provider=memory` 时点「选择图纸」→ 上传失败；主流程卡在提交订单（要求每个零件有图纸）。

**根因**：`MemoryStorageService.presignedPut` 返回 `memory:///put/...`，浏览器发不出去。

**改动**

| 文件 | 改动 |
|---|---|
| `MemoryStorageService.java` | 预签名改成同源一次性 URL；新增 token 表与 `consume()`；`Entry` 改为包内可见 |
| `DevStorageController.java`（新） | `PUT/GET /dev/storage/{token}`，仅 `provider=memory` 时注册 |
| `StorageConfig.java` | memory bean 传 `app.api.prefix`（URL 要指向本应用） |
| `SecurityConfig.java` | 条件性放行 `/dev/storage/**`（仅在 memory 模式） |
| `MemoryStorageServiceTest.java` | 修构造参数 + 新增 2 个用例（同源一次性、操作类型隔离） |

## 三、修复：运营端语言偏好存不下来

**症状**：运营后台每次加载都有一条
`PATCH /api/v1/customer/me/locale → 403 common.wrong_portal`；切语言看着生效，实际没存。

**根因（两处叠加）**：前端把非 SUPPLIER 一律送到 `/customer/me/locale`；后端也没有
`/ops/me/locale`，且 `updateLocale` 只改 `external_user`。

**改动**

| 文件 | 改动 |
|---|---|
| `MeLocaleController.java` | 加 `/ops/me/locale` |
| `AuthService.java` | `updateLocale` 兼容 `ops_user`（先外部后运营） |
| `portal/src/services/auth.ts` | 按 partyType 查表，OPERATOR → `/ops/me/locale` |

**验证**：把 `ops_user.locale` 清成 null，运营登录 → `PATCH /api/v1/ops/me/locale` **200**，
库里 `locale=zh`。

## 部署

- 无迁移、无配置项变化
- `DevStorageController` 只在 `app.storage.provider=memory` 时存在；生产是 s3，这些路径 404
- 前端重新构建即可（文案/路径改动）

## 遗留项

- **E2E 只覆盖 happy path**：拒绝报价、返工/报废、定向派单、验证码登录都没覆盖
- **E2E 依赖种子运营账号**：`seed-ops.sh` 直接写库 —— 反过来印证「运营账号创建入口」这个缺口还在
- **E2E 每次跑都造新数据**：库会持续变大，要干净重来就重建 `mfg_e2e`
- **memory 存储的签名 URL 不参与真实签名校验**：它只在本地/测试用，生产必须 s3
