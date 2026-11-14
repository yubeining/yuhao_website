# 需求 —— 国家/地区下拉要覆盖全球（2026-11-14）

## 需求原话

> 「国家 地区这边有问题啊 怎么只有这么几个」（附注册页下拉截图：Germany / Austria / Switzerland / Netherlands / 其他）

## 核实

- 列表是 `RegisterPage.tsx` 里写死的 4 个国家，从原型 `docs/design/prototype/原型v2.html:998` 抄来，
  `docs/design/` 里没有任何「首批只做这四国」的依据。
- 更麻烦的是格式不一致：注册页存英文全名 `Germany`，而运营端建组织时后端
  `OpsOrganizationController` 的字段是 `@Size(max = 2)`、输入框提示 `DE` —— 同一个
  `organization.country` 存了两种格式。

## 决策（需求方选定）

- **存两位 ISO 3166-1 alpha-2 代码**（与运营端口径一致）
- **全球完整列表**

## 验收

- 注册页、运营端「账号管理 → 组织」都使用同一个国家下拉
- 下拉约 250 项，名称跟随当前语言（中文按拼音排序）
- 提交给后端的值是两位代码；「其他」和未选都提交 `null`
