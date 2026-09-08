# 变更记录 —— 统一分页入参 PageQuery + 全局 size 封顶

> 2026-09-08 ｜ common/web ｜ 无 schema、无 domain

## 新增 / 改动

- `common/dto/PageQuery(page, size)`:分页请求入参。**page 从 1 起**(反 Spring 的 0-based 反直觉),
  构造器兜 page≥1/size≥1;`toPageable()` 转成 Spring 的 0-based `Pageable`(sort 由后端定,不从 query 收)。
- `common/web/PageQueryArgumentResolver`:从 `?page=&pageSize=` 解析,缺参用默认、非法回落默认、
  **size 超全局上限截到上限**(不报错)。注册进 `WebMvcConfig`。
- `AppProperties.Web.Page(defaultSize=20, maxSize=200)` + `application.yml app.web.page`(可环境变量覆盖)。
- `PagedResponse.page` 改为 **1-based**(出口 +1),和 PageQuery 请求侧对齐。
- 单测 `PageQueryArgumentResolverTest`(5 例):默认、封顶、非法回落、page 下限、正常值 + toPageable 换算。

## 一个纠偏

初版把 size 上限做成"内部端/外部端两个值、按路径前缀选"——**错了**。分页是全局统一的通用机制,
不该按接口/受众分叉;内外之分是 **controller / 路径层(端级闸门 `/ops` vs `/customer|/supplier`)** 的职责,
不进分页组件。已改回**单一全局上限**。

## 验证

- `mvn verify` 绿(单测 21 + 集成 18,S3/AI 4 skip);上下文带新 `WebMvcConfig(AppProperties)` 装配正常启动。

## 说明

- 现在还没有列表接口用到它;第一个分页接口直接 `PageQuery page` 入参 + `PagedResponse.of(...)` 出参即可。
