# 变更记录 —— 合并为账号设置（2026-11-15）

## 改动

| 文件 | 改动 |
|---|---|
| `pages/AccountSettingsPage.tsx` | 新增：基本资料（原 ProfilePage）+ 偏好（语言、外观） |
| `pages/ProfilePage.tsx` / `SettingsPage.tsx` | 删除（内容已并入） |
| `router.tsx` | 三端 `settings` 指向新页；客户/运营的 `profile` 重定向到 `settings`；供应商 `profile` 仍是「企业资料」 |
| `AppShell` | 用户菜单只留「退出登录」（设置入口本来就在侧边栏底部，不重复放）；顺手删掉不再使用的 `settingsTo` 透传 |
| `i18n` | 新增 `account.*`；删除不再使用的 `nav.profile` |
| `styles.css` | `.setrow` / `.seg`（偏好行 + 分段控件） |

## 为什么这样切

- 资料卡需要"改多个字段再保存"，所以保留编辑态
- 语言/外观点一下就生效，不需要保存按钮 —— 这也去掉了原来"整页一个编辑按钮"的别扭
- 侧边栏底部「设置」是唯一入口；用户菜单里不再重复放一个「个人资料」

## 验证（真跑）

```
/customer/settings → 卡片 = ["Basic information","Preferences"]
点 English → 页面标题 = "Account settings"（语言即时生效）
/customer/profile → 重定向到 /customer/settings
```

`type-check`、`build` 通过。

## 遗留

- 「偏好」目前只有语言和外观；通知、安全等按同一分段往后加
- 供应商的「企业资料」页没动（公司名/USCC/联系方式仍在那边）
