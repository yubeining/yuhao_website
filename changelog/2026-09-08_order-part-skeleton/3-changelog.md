# 变更记录 —— 订单 + 零件 基础骨架表(业务表第一批)

> 2026-09-08 ｜ 新迁移 + 7 个实体 ｜ domain/order ｜ 无 service/controller

## 背景

按对话逐轮敲定的业务表骨架。只建"归属 / 关联 / 唯一编号 / 溯源",状态流转、图纸/文件、
数量/材料/工艺/规格、价格、时间、人类可读编号、part_no 生成规则一律后续再加列。

## 迁移 `2026-09-08_05_order-and-part-skeleton.sql` —— 7 张表

**订单(3,独立域,不直连)**:`customer_order`(客户建)、`ops_order`(运营组装)、`supplier_order`(供应商接)。
**零件设计模板(1,归客户)**:`part_design`(同一种零件;`customer_org_id` + 客户内唯一 `code` + `name`)。
**零件实例(3)**:`customer_order_part`(溯源根)、`ops_order_part`、`supplier_order_part`,各有 `part_no` 唯一编号、指回 `part_design`。

**关联/溯源**:订单之间不直连;下游零件实例存 `upstream_part_id`(指上游零件实例)+ 冗余
`source_customer_order_id` / `source_customer_id`(创建时快照)。多对多发生在零件派生链上。
无外键(§4),全裸 uuid + 显式索引;`part_no` 目前表内唯一,全局唯一待编号生成规则。

## 实体(7,`com.mfg.domain.order`,均继承 BaseEntity)

uuid 列钉 `@JdbcTypeCode(SqlTypes.UUID)`;下游零件实例的 upstream/source 列 NOT NULL(下游必派生;
将来若需放宽,去约束是安全的单步变更)。

## 明确未做(后续)

状态流转、图纸/文件表 + 版本、数量/材料/工艺/规格 jsonb、价格、时间、订单人类可读编号、
part_no 生成规则;以及这几张表的 repository/service/controller。

## 验证

- 空库 validate 启动:迁移执行器应用到 `_05` → JPA validate 通过 → Started(7 实体与 schema 零漂移,共 14 张业务表)。
- `schema.sql` 重放重生成 → 14 表 0 外键。`mvn verify` 绿(21 单测 + 23 集成)。

## 注意

- CLAUDE.md 仍写"domain 业务包当前保持为空、前端优先";本轮按用户明确指示在 domain/ 建业务表,
  该条与现状矛盾,建议更新(见提交说明)。
