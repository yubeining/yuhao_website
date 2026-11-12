# 变更记录 —— 注册不填公司名（2026-11-12）

## 验证（实跑）

```
mvn verify                80 单测 + 150 集成，0 失败，5 跳过
npm run type-check        通过
npm run build             通过
e2e                       23/23 通过（新增了「补公司名」这一步）
迁移                       mfg_e2e 上已应用；organization.name 的 is_nullable = YES
```

新增集成测试 `CustomerOrderFlowIT#orderCannotBeSubmittedBeforeCompanyNameIsFilled`：
注册不填公司名 → 零件和图纸都齐了 → 提交被拒（400 `organization.name_required`）
→ 补名字 → 提交成功。**负向和正向都覆盖。**

## 改动

**数据库**

| 文件 | 改动 |
|---|---|
| `database/migrations/2026-11-12_01_organization-name-optional.sql`（新） | `ALTER TABLE organization ALTER COLUMN name DROP NOT NULL` |
| `database/schema.sql` | 同步快照 |

**后端**

| 文件 | 改动 |
|---|---|
| `Organization.java` | `name` 去掉 `nullable = false` |
| `RegisterRequest.java` | `orgName` 改为可选（`@Size(max=200)`） |
| `IdentityService.java` | 注册时 `trimToNull(orgName)`；新增 `renameOwnOrganization` |
| `ExternalOrgController.java` | 新增 `PATCH /customer/organization`（补公司名） |
| `CustomerOrderService.java` | `submit()` 增加公司名门禁 → 400 `organization.name_required` |

**前端**

| 文件 | 改动 |
|---|---|
| `pages/auth/RegisterPage.tsx` | 删掉「公司名称」输入框（国家保留） |
| `pages/SettingsPage.tsx` | 新增「公司信息」卡片（仅客户端）：显示 + 保存公司名 |
| `services/auth.ts` | `RegisterInput.orgName` 改为可选 |
| `services/customer/organization.ts` | 新增 `renameMyOrganization` |
| `i18n/strings.ts` | 公司信息文案（中/英）+ `organization.name_required` 错误文案 + `common.save` |

**测试与文档**

- `CustomerOrderFlowIT` 新增 1 个用例（含 `registerWithoutCompany` 辅助方法）
- `docs/design/14-客户入驻与组织账号.md` 新增 §4.4「已实现的部分」
- `e2e/e2e-main.mjs` 注册步骤去掉公司名，新增第 5 步「补公司名」

## 部署

- 迁移：`DROP NOT NULL` 是**向后兼容**的安全方向（旧代码不依赖这列非空），一次发布即可
- 无新增环境变量、无新增依赖
- 老数据（有名字的公司）完全不受影响

## 遗留项

- **一家公司多人**：还没有「邀请同事进同一公司」的入口（P1）。现在仍然是注册一次建一家公司
- **供应商侧不能自己改公司名**：公司名来自邀请，改名规则未定（文档 14 待确认项）
- **补公司名的入口只放在设置页**：没有做「注册后顶部横幅提醒」，用户可能一直不补，
  直到提交订单被拦才发现。要不要加提醒，等你定
- **VAT / 账单信息**：按 D2 暂缓
