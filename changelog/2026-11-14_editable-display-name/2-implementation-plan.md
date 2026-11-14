# 实施计划 —— 可编辑称呼（2026-11-14）

## 后端

1. `PATCH /{customer|supplier|ops}/me/name`，请求体只有 `displayName`
   - 用户 id 从 principal 取，体里没有身份字段（§3 铁律 3）
   - 三端各一条路径：路径前缀即受众，端级闸门才管得到
2. `AuthService.updateDisplayName`：外部用户与运营账号在两张表，两处都试
   （和 `updateLocale` 同一个坑，注释已写）
3. `IdentityService.registerVerifiedEmail`：邮箱前缀不含字母时，称呼回落成完整邮箱

## 前端

1. 设置页「账号」卡片：称呼从只读变成可编辑，保存后写回 session，顶栏立刻更新
2. `updateMyDisplayName(partyType, name)`，路径按端映射
3. i18n 增 `nameHint` / `nameSaved`

## 被否决的方案

- **注册时让用户填名字**：与「注册只要邮箱、主打简单快速」直接冲突
- **前端把数字称呼隐藏**：治标，用户仍然无法设置真名
- **只改默认值不回填**：老账号还是数字，且没有自助入口
