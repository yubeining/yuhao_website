# 收货地址簿：改动记录

分支 `feat/shipping-address-book`。需求见 `1-requirement.md`，方案见 `2-implementation-plan.md`。

## 改了什么

### 数据库

- 新迁移 `2026-11-26_01_shipping-address.sql`：新表 `shipping_address`（按 `external_user_id` 归属），
  索引 `(external_user_id, created_at)`，部分唯一索引「每人最多一个默认」。同步 `schema.sql`、迁移 README 的表归属。
- 不改 `customer_order`：订单上原有的 9 列 `ship_to_*` 继续当快照用。

### 后端（新域 `domain/address`）

- `AddressBook`（public 接口）+ `AddressInfo`（public record）：对订单域的唯一契约。
- `ShippingAddress` / `ShippingAddressRepository` / `ShippingAddressService`：增删改查、设默认。
  第一条自动默认，删掉默认后最早一条顶上，默认不能直接取消，每人最多 20 条。写操作先锁这个用户的全部地址。
- `CustomerShippingAddressController`：`/customer/shipping-addresses`（GET / POST / PUT / DELETE / `{id}/default` / `parse`）。
- `OpsShippingAddressController`：`GET /ops/users/{userId}/shipping-addresses`，只读。
- `AddressParser` + `prompts/address-parse.txt`：智能粘贴走现有 AI 服务（provider 默认模型），只拆不存；
  国家必须是 ISO 代码、超过表单上限的值丢掉；原文和模型输出不进日志。`parse` 接口按用户限流，每人每小时 30 次。

### 订单域

- `CustomerOrderService.create`：建草稿时把下单人的默认地址复制进订单。
- `PUT /customer/orders/{id}/ship-to` 的请求体从 9 个字段改成 `{ addressId }`。按 `(addressId, 当前用户)` 取，
  别人的地址 404 `address.not_found`。READY 锁不变。
- 删掉订单 service 里不再用到的国家码校验（已挪到地址域）。

### 前端

- 设置页（只在客户端）加「收货地址」卡片 `AddressBookCard`：列表、默认标记、设为默认、复制、编辑、删除（确认弹框）、新增。
- `AddressFormModal`：新增 / 编辑弹框，字段照原来的订单地址弹框，加「设为默认地址」和智能粘贴。
- `ShipToEditor`：订单页「编辑」改成从地址簿选的弹框，可以在弹框里新增，存完直接选中。
- 运营「账号 › 用户」：客户用户那一行多「收货地址」按钮，点开只读弹框（`RowActions` 加了可选的 `extra` 插槽）。
- `components/addressFormat.ts`：列表单行格式和「复制」的多行文本。原样输出，国家显示成界面语言的名字。
- 文案：新增 `addressBook` 一组、错误码 `address.*`、`common.rate_limited`；删掉不再出现的 `order.ship_to_country_invalid`。
- `styles.css` 加地址列表 / 选择卡片 / 文本框的样式，只用 token。

### 五轴审查后的修复（2026-11-26）

- **并发新增第一条地址**：原来只锁地址行，地址簿为空时锁不到，两个并发的「新增第一条」都会被设成默认
  （测试库没有部分唯一索引时出现两个默认；线上会被索引拦下变成 500）。改成按用户加事务级 advisory 锁，
  地址簿为空也能排队；并发测试 5 轮都只有一个默认。部分唯一索引保留兜底。
- **订单选地址弹框的预选**：原来总是预选默认地址，换过非默认地址的订单点开直接「使用」会被换回默认。
  改成预选和订单当前地址完全相同的那条，找不到就不选（按钮置灰）；订单还没地址时才预选默认。
- **补测试**：同一公司同事互相看不到、改不了（`ShippingAddressFlowIT`）；智能粘贴每人每小时 30 次、
  第 31 次 429、不影响别人（`AddressParseRateLimitIT`，只 mock 外部 AI，Redis 是真的）。

### 智能粘贴线上首测失败的修复（2026-11-26）

- **原因**：智能粘贴没指定模型，本意用默认模型；但 `SealosAiProvider` 每次新建 `OpenAiChatOptions`，没写模型时
  Spring AI 填的是它内置的 `gpt-5-mini`（本地用假网关抓请求确认），网关上没有这个模型 → 502 `address.parse_failed`。
  估价一直显式传模型，所以没暴露。
- **修法**：`SealosAiProvider` 没指定模型时显式带上配置的默认模型；兜底默认模型从 `deepseek-chat`（不在网关模型列表里）
  改成 `deepseek-v4.1-flash`；智能粘贴单独配模型 `app.address.parse-model`（环境变量 `AI_ADDRESS_PARSE_MODEL`），
  默认 `qwen3.8-max`（需求方定，不考虑费用）。
- **日志**：智能粘贴失败时记模型名和完整原因链（`AiException.describe`，从 `EstimateService` 挪过来共用），不记地址原文。

## 部署清单

- 迁移随开机自动执行，只新建表，无需扩展-收缩。
- 智能粘贴用现有的 `SEALOS_AI_*` 配置；模型可用 `AI_ADDRESS_PARSE_MODEL` 覆盖（不配就是 `qwen3.8-max`）。
- ★ 检查 Sealos 环境变量 `SEALOS_AI_MODEL`：如果线上设成了 `deepseek-chat`，要改成网关上存在的模型（建议 `deepseek-v4.1-flash`）。
- 部署那一刻还开着的旧页面，在订单上保存地址会 400（请求体变了），刷新即可。

## 遗留 / 后续

- `CustomerOrderFlowIT.malformedRequestsAreClientErrorsNotServerErrors`（`PUT /customer/orders` 期望 405 实际 404）
  在 main 上原本就失败，不是这次引入的，没修。后来在本 worktree 跑过一次 `npm run build`（产物写进后端 static）之后，
  这个测试又通过了 —— 看起来取决于本地有没有前端构建产物，没再深究。
- 第二遍跑全部迁移时，`2026-08-02_02` 和 `2026-09-07_01` 两个老迁移不幂等（不是这次的文件）。线上靠 `schema_migrations` 不会重跑，没修。
- 智能粘贴没有拿真实 AI 跑过（测试里 AI 是 mock 的，测试环境不连 AI）。上线前要在有 AI 密钥的环境里手动试几条各国地址。
