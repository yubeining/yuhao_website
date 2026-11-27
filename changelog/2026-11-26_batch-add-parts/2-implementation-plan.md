# 实现计划（2026-11-26 批准）

## 一、图号不再唯一
- `CustomerOrderService.addLine` 不再按图号查已有零件，总是新建零件 + 第 1 版。
- 删「按图号查零件」接口（`GET /customer/parts?code=`）及其服务 / 仓库方法；`insertPart` 去掉查重。
- 前端「添加零件」页去掉已有零件提示；删对应文案。
- 迁移删唯一索引，和代码一起发（用户接受回滚风险，没拆两次）。

## 二、批量添加
- 后端 `POST /customer/orders/{id}/lines/batch`：一个事务建多行，只收图号 / 名称 / 数量 / 材料 / 表面处理 / 客户版本。
- 前端新页 `orders/:id/parts/batch`：浏览器里解压、读清单、按图号归行；确认表 + 编辑弹框；保存后逐个传图纸。

## 被否决的方案
- 后端暂存 + 解析记录快照（文档 7 §7 的做法）：用户要求保存前服务端不存任何东西。
- 逐行调用现有建行接口：中途断开只会进一部分行，改为批量接口。
- 冲突时给「沿用上次图纸 / 开新版本 / 不加」下拉：界面太乱，后改为图号不唯一，冲突不存在了。
- 记住客户的列映射：要在服务端存东西，和「保存前不存」冲突，改为每次自动猜 + 可改。

---

# 第二轮实现计划（2026-11-27 批准）

## 数据库
- 迁移 `2026-11-27_01_draft-part-fields-nullable.sql`：`customer_order_part.part_no / part_name / quantity`、
  `part_design.code / name` 去掉非空；数量 `>= 1` 的 CHECK 保留。`schema.sql` 同步。

## 后端
- `POST /customer/orders` 收整张订单（名称、交期、地址、零件），一个事务建好；第一次保存才调用。
- 新增 `PUT /customer/orders/{id}`：草稿整张替换。带 id 的行更新（图号、名称、数量、材料、表面处理、客户版本），
  没 id 的新建，没带到的删掉；`removeFileIds` 在同一事务里删（对象存储提交后再删）。返回 `{order, createdLineIds}`。
- `PUT /ship-to` 改为收地址内容（订单自己的一份），提交后到就绪前单独改用。
- 提交检查加「每行有图号、名称、数量」→ 400 `order.line_incomplete`（带行 id）。
- 删：`PATCH /customer/orders/{id}`、`POST …/lines`、`POST …/lines/batch`、`PATCH / DELETE …/lines/{id}`、`POST …/new-revision`。
- 测试：`CustomerOrderFlowIT` 改走整张保存，新增整单新建 / 整张替换 / 空字段能存但提交被拦 / 别的订单的行和文件 id 被拒 等；
  派单、生产、报价、合同 4 个集成测试的建单辅助方法改为整张建单。

## 前端
- `lib/orderDraft.ts`（纯函数 + vitest）：编辑副本、改动判断、组保存请求、导入合并、提交缺项。
- 重写 `OrderDetailPage`，新增 `OrderPartsTable`；`ShipToEditor` 改成受控（修改 / 更换 / 地址簿为空直接添加）；
  `AddressFormModal` 加「订单地址」模式；路由加 `orders/new`，删零件页和批量页。
- 文案、样式（全部走 CSS 变量，深浅两套）同步。

## 文档
- `CLAUDE.md` C7 加「草稿订单整页编辑」例外和理由；设计文档 12 记录本轮拍板。

## 被否决的方案（本轮）
- 订单页一个入口、加一个零件用弹框：用户不要弹框。
- 单个零件弹框里直接存、导入的才待保存：两套保存方式，用户看不懂，改成全部统一保存。
- 订单信息、地址各自「编辑 → 保存」：冗余，改成整张一次保存。
- 提交弹框里直接填日期、选地址：信息乱、像 AI 写的，改成只列缺项 + 回页面上填。
- 收货地址卡片在编辑时列出整个地址簿：不合理，改成只显示一条 + 修改 / 更换。
