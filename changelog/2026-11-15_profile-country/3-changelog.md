# 变更记录 —— 个人资料加国家/地区（2026-11-15）

## 后端

| 文件 | 改动 |
|---|---|
| `ExternalOrgController.RenameRequest` | 增加 `country`（`^[A-Za-z]{2}$`，允许 null） |
| `IdentityService.renameOwnOrganization` | 同时更新国家；空串按格式错误拒掉，避免库里出现两种空值 |
| `AccountAdminService.updateOrganization` | **移除 country 参数**（运营端不再改国家） |
| `OpsOrganizationController.UpdateOrganization` | 同步移除 country（新建组织仍可带） |

## 前端

| 文件 | 改动 |
|---|---|
| `ProfilePage` | 查看态一行「国家/地区」；编辑态用 `CountrySelect`；保存时一并提交 |
| `CountrySelect` | 新增 `allowOther`（资料页传 false —— 库里不存 OTHER，选它会显示成 `—`） |
| `services/customer/organization` | `renameMyOrganization(name, country)`，空值统一转 null |
| `ops/AccountsPage` | 编辑组织时隐藏国家字段；更新请求不再带 country |
| `i18n` | `profile.country`（中英） |

## 验证（真跑）

```
个人资料编辑 → 选 Germany → 保存
查看态显示：Country / region = Germany
数据库：organization.country = 'DE'
mvn test 92 通过；AccountAdminIT 9 通过
```

## 遗留

- 国家变更没有留痕（谁改的、旧值）。现在运营改不了，冲突消失；以后要对账再加
- 新建组织时运营仍可带国家，这条没动 —— 客户自注册的路径不会经过它
