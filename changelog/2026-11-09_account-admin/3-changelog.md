# 变更记录 —— 运营后台账号管理（2026-11-09）

## 验证（实跑）

```
mvn test                     78 项，0 失败
mvn verify                   149 项，0 失败，5 跳过（跳过项与之前相同：AI key / 实时行情 / 真实 S3 桶）
npm run type-check           通过
npm run build                通过（487.30 kB，gzip 144.28 kB）
check-i18n-literals.py       通过（没有新增写死的中文）
check-non-ascii-literals.py  通过
check-no-foreign-keys.py     通过
check-schema-sync.py         通过
```

新增集成测试 `AccountAdminIT`（9 个用例），重点验证的不是"接口能返回 200"，而是：

| 用例 | 验证什么 |
|---|---|
| `createExternalUserCanLoginThenDisableBlocksLogin` | 禁用之后**密码登录真的失败**（401），不只是列表里改个字 |
| `createStaffAndDisable` | 同上，运营账号禁用后 `/auth/internal/login` 也失败 |
| `organizationTypeCannotBeChangedByUpdate` | 编辑请求体里塞 `type` 也不会生效 |
| `externalUserCannotBeAttachedToInternalOrg` | 外部用户挂内部组织 → 400 |
| `staffCannotBeCreatedUnderCustomerOrg` | 运营账号挂客户组织 → 400 |
| `duplicateEmailIsRejected` | 同邮箱重复创建 → 409 |
| `searchMatchesEmailAndOrgName` | 搜索能按**公司名**命中 |
| `customerTokenCannotReachAccountAdmin` | 客户 token 打三个新端点全部 403 |

## 新增

**后端**（`platform/identity`）

| 文件 | 作用 |
|---|---|
| `AccountAdminService.java` | 三类对象的增删改查、校验、密码编码 |
| `OpsAccountController.java` | `/ops/users`（外部用户）、`/ops/staff`（运营账号） |
| `dto/AccountView.java` | 外部用户列表行（含公司名/类型、邮箱验证时间） |
| `dto/StaffView.java` | 运营账号列表行 |
| `dto/OrganizationAdminView.java` | 组织列表行（比对外视图多一个 `createdAt`） |

**改动的现有文件**

| 文件 | 改动 |
|---|---|
| `OpsOrganizationController.java` | 从只读改为增删改查；列表支持 `q` / `type` 过滤 |
| `ExternalUserRepository.java` | 加 `search`（邮箱/姓名/公司名，实体连接）与按组织的分页查询 |
| `OpsUserRepository.java` | 加 `search`、`existsByEmail` |
| `OrganizationRepository.java` | 加按名称/类型的派生查询 |

**前端**

| 文件 | 作用 |
|---|---|
| `pages/ops/AccountsPage.tsx` | 三个 tab：外部用户 / 组织 / 运营账号 |
| `services/ops/accounts.ts` | 对应的 service 层 |
| `i18n/strings.ts` | 新增 `ops.accounts` 文案（类型 + 中文 + 英文） |
| `router.tsx` / `AppShell.tsx` | 新增 `/ops/accounts` 路由与「账号管理」菜单项 |

## 部署

- 无迁移、无配置项变化
- 新端点都在 `/ops/**` 下，沿用端级闸门，无需额外授权配置
- 前端路由新增一级路径 `/ops/accounts`，已在 `SpaForwardController` 已覆盖的 `/ops` 前缀内
  （刷新不会 404）

## 遗留项

- **没有审计**：谁禁用/改了哪个账号，事后查不到（需求方明确说现在不记录）。要补得先建审计表
- **运营账号任何人都能建**：现在是提权通道，等 ADMIN 角色落地时收口
- **没有分页控件**：接口支持 `page` / `pageSize`，页面只取了第一页（50 条）。
  数据量上去之前够用，上去之后要补翻页
- **没有密码重置**：运营能建号、能禁用，但不能帮用户改密码。密码忘了只能走 OTP 登录
  （客户端已支持），或直接改库
