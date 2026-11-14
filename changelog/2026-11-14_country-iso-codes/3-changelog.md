# 变更记录 —— 国家/地区改为 ISO 两位代码（2026-11-14）

## 功能

- 注册页国家下拉从 4 个写死的国家换成 249 个 ISO 3166-1 代码（+「—」+「其他」）
- 运营端「账号管理 → 组织」的国家字段从自由输入（提示 `DE`）改为同一个下拉，
  列表里显示当前语言的国家名
- 提交给后端的是两位代码；「其他」与未选都提交 `null`

## 新增文件

- `portal/src/i18n/countries.ts` —— 代码表 + `Intl.DisplayNames` 包装
- `portal/src/components/CountrySelect.tsx` —— 复用下拉

## 数据影响

- `organization.country` 的口径从「注册页存全名 / 运营端存代码」统一为**两位代码**
- 线上库在本次变更前已清空（2026-11-14 测试数据清理），没有历史值需要迁移
- **如果以后还有环境存着 `Germany` 这类全名**，编辑组织时下拉匹配不到值会显示为空，
  需要一次性 `UPDATE organization SET country = 'DE' WHERE country = 'Germany'`（按需补全）

## 验证

- `npm run type-check` 通过
- `npm run build` 通过，`index-*.js` 477.09 → 490.78 kB（国家表 + 排序逻辑）
- Chrome headless 渲染 `/auth/register`：下拉共 251 个 option，中文名按拼音排序
  （首个为「阿尔巴尼亚」），`德国` 等名称存在

## 遗留项

- 存的是代码，历史数据里如果混入过全名需要按上面的 SQL 归一（当前无此类数据）
- 国家目前只影响展示，不参与币种/合规逻辑（`docs/design/14` 提到「影响币种与合规」尚未实现）
