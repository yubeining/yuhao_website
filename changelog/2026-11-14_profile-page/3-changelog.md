# 变更记录 —— 个人资料页（2026-11-14）

## 功能

- 三端新增 `/{customer|supplier|ops}/profile`：昵称可编辑，邮箱 / 身份 / 注册时间置灰
- 顶栏头像菜单新增「个人资料」入口
- 保存后写回 session，顶栏昵称立即更新
- 设置页删掉只读的「账号」卡片

## 后端

| 文件 | 改动 |
|---|---|
| `auth/MeProfileController.java` | 新增 GET / PATCH 三端路径 |
| `auth/AuthService.java` | `findProfile` / `updateNickname`（外部 + 运营两张表） |

## 前端

| 文件 | 改动 |
|---|---|
| `pages/ProfilePage.tsx` | 新增 |
| `components/AppShell.tsx` | 头像菜单入口 + 路径推导 |
| `pages/SettingsPage.tsx` | 移除账号卡片与相关状态 |
| `components/form.tsx` | `Input` 支持 `disabled` |
| `styles.css` | `.inp:disabled` 置灰 |
| `services/auth.ts` | `getMyProfile` / `updateMyNickname` |
| `router.tsx` / `i18n/strings.ts` | 三条路由 + 文案（中英） |

## 验证（真跑）

Playwright 驱动 Chrome，完整走了一遍：注册 → 头像菜单进「个人资料」→
3 个只读字段确认为 disabled → 昵称改成「林可」→ 保存 → 顶栏同步为「林可」。

另有 `npm run type-check`、`npm run build` 通过；`mvn test` 85 通过。

## 部署清单

- 后端重新构建（新增两个端点）+ 前端构建
- 无迁移、无配置变更

## 遗留项

- 老账号昵称仍是邮箱前缀（数字邮箱就是一串号码），需要用户自己进「个人资料」改
- 昵称没有唯一性与敏感词校验，就是 1–100 字符文本
- 「设置密码」「更换邮箱」未做，等产品规则
