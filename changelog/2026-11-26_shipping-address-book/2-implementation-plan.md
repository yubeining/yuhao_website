# 收货地址簿：实现方案（待批准）

需求和已定事项见 `1-requirement.md`。这份方案等批准后才动代码。文末「还要你定」那几条答完之前，相关部分不动。

## 我按授权定的

- **Q9 条数上限：每人最多 20 条。**需求方说「你看着办」。理由：B2B 客户收货点通常就几个，20 条够用；有上限也挡住了脚本刷接口。超出时返回错误码，前端提示「最多 20 条」。
- **删除是物理删除。**依据是 Q4：订单只存快照、不存地址簿 id，没有任何记录引用地址簿的行，所以 CLAUDE.md「优先不删、走状态位」防的那种问题（历史记录指向已删行）在这里不存在。

## 数据库

新迁移 `database/migrations/2026-11-26_01_shipping-address.sql`，同步改 `schema.sql`。只新建表，不碰 `customer_order`，不需要扩展-收缩。

表 `shipping_address`：

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | uuid PK | |
| `external_user_id` | uuid NOT NULL | 所有者（Q2：按个人）。裸 uuid，不建外键（§4） |
| `country` `company` `contact` `phone` `line1` `city` | text NOT NULL | 和订单上的必填项一致（Q1） |
| `line2` `region` `postal_code` | text | 选填 |
| `is_default` | boolean NOT NULL DEFAULT false | |
| `created_at` `updated_at` | timestamptz | |
| `version` | bigint | 乐观锁，和其他表一样 |

索引：`(external_user_id, created_at)`，用来列表排序和「最早一条顶上」；部分唯一索引 `(external_user_id) WHERE is_default`，在库里保证每人最多一个默认。

## 后端

新开一个域 `domain/address`（P1 已定）。域里扁平一层，只有注明 public 的是对外契约，其余全部包私有。订单只通过 `AddressBook` 接口读地址，是单向依赖。

| 文件 | 改动 |
|---|---|
| `domain/address/AddressBook.java`（新，public interface） | 对外唯一契约：`Optional<AddressInfo> findDefault(userId)`、`AddressInfo require(userId, addressId)` |
| `domain/address/AddressInfo.java`（新，public record） | 给订单用的 9 个字段，不是实体 |
| `ShippingAddress.java`（新） | 实体 |
| `ShippingAddressRepository.java`（新） | 所有查询都带 `externalUserId` 条件（§3 铁律 2） |
| `ShippingAddressService.java`（新） | 列表（默认在前，其余按创建时间）、新增（第一条自动默认；满 20 条拒绝）、修改、删除（删的是默认就把最早一条设为默认，Q8）、设默认。字段校验复用订单 ship-to 现有规则（ISO 国家码、长度） |
| `ShippingAddressView.java`（新，public record） | 白名单输出（§3 铁律 5） |
| `CustomerShippingAddressController.java`（新） | `GET/POST /customer/shipping-addresses`、`PUT/DELETE /customer/shipping-addresses/{id}`、`POST /customer/shipping-addresses/{id}/default`。所有者一律取 `user.id()`，不从请求收 |
| `OpsShippingAddressController.java`（新） | `GET /ops/users/{userId}/shipping-addresses`，只读（Q10） |
| `CustomerOrderService.java` | `create`：查这个用户的默认地址，有就复制进订单的 9 列（Q3）。`updateShipTo`：改为收 `addressId`，按 `(addressId, userId)` 取，取不到就 404，取到后复制（Q4 / Q5）。READY 锁不变 |
| `CustomerOrderController.java` | `PUT /customer/orders/{id}/ship-to` 的请求体从 9 个字段改成 `{ addressId }`，并把 `user.id()` 传进 service |

另有 `CustomerShippingAddressController` 上的 `POST /customer/shipping-addresses/parse`，调 `platform/ai` 拆地址，不落库（P2）。写一个单测，把 AI 服务 mock 掉，覆盖模型返回非法国家码、缺字段、超长输入三种情况。

## 前端

| 文件 | 改动 |
|---|---|
| `services/customer/shippingAddresses.ts`（新） | 增删改查、设默认；在 services 聚合导出加一行 `export *` |
| `services/` 运营侧 | 加一个读某用户地址簿的函数 |
| `pages/customer/AddressBookCard.tsx`（新） | 设置页的「收货地址」卡片：列表、默认标记、编辑 / 设为默认 / 删除 / 复制、新增 |
| `pages/customer/AddressFormModal.tsx`（新） | 新增 / 编辑弹框，字段照 `ShipToEditor` 现在的，加「设为默认」和智能粘贴 |
| `pages/AccountSettingsPage.tsx` | 只有客户端才显示上面这张卡片（这页三端共用），放在资料和偏好之间（Q11） |
| `pages/customer/ShipToEditor.tsx` | 从「手填弹框」改成「从地址簿选」弹框；按钮文字「编辑」；弹框里有「+ 新增地址」，存进地址簿后直接选中（P3）；地址簿为空时给「新增地址」 |
| `pages/ops/accounts/UsersTab.tsx` | 客户用户那一行加「收货地址」，点开只读弹框（P5） |
| `i18n/strings.ts` | 新文案，所有语种都加 |

`ShipToCard`（订单上的只读展示，客户和运营共用）不改。

## 顺序（TDD）

1. 迁移 + `schema.sql`，按 `database/migrations/README.md` 从零建一次库。
2. 写 `ShippingAddressFlowIT`（红）：增删改查、第一条自动默认、删默认后顶上、上限 20、改不到别人的地址、运营只读。然后写实体 / 仓库 / service / controller（绿）。
3. 在 `CustomerOrderFlowIT` 里加用例（红）：建草稿自动带默认地址、按 addressId 换地址、拿别人的 addressId 被拒、READY 后被拒、改地址簿后订单不变。然后改订单 service / controller（绿）。
4. 前端 services → 设置页卡片 + 表单弹框 → 订单页选择弹框 → 运营只读弹框 → 文案。
5. 智能粘贴：先写后端 parse 接口和单测，再接到新增弹框。
6. 复制按钮（纯前端）。

## 验证

- `cd backend && mvn verify -Dit.test='com.mfg.domain.order.**'`（先 `docker compose up -d`）
- 提交前：`cd backend && mvn verify` 全量，含 `ArchitectureTest`
- `cd portal && npm run build`
- `.githooks/pre-commit`
- 浏览器里走一遍：设置页增删改和设默认 → 新建订单带出默认 → 换地址 → 提交；运营端查看；窄屏

## 风险

- **`PUT /ship-to` 的请求体变了。**前后端在同一个 jar 里一起发布，但部署那一刻还开着的旧页面再保存地址会报 400，刷新就好。
- **设默认的并发。**两个请求同时设默认，部分唯一索引会让其中一个失败，不会出现两个默认。
- **`AccountSettingsPage` 三端共用。**地址卡片只在客户端渲染，供应商 / 运营的设置页不能出现（设计文档 1 §3.2）。
- **AI 调用费用和滥用。**parse 接口按用户限流；模型拆错时用户在表单里能看到、能改，不会直接存进库。
- **地址是个人信息。**审计 payload、日志里都不放地址内容（§6）；智能粘贴的原文也不进日志。

## 后续已定（2026-11-26）

- **P1**：新开域 `domain/address`。
- **P3**：下单选地址的弹框里放「+ 新增地址」，存进地址簿后直接选中。
- **P5**：运营在「账号 › 用户」列表里，客户用户那一行加「收货地址」，点开是只读弹框。

- **P2**：智能粘贴走现有 AI 服务（`platform/ai`）。
  - 新接口 `POST /customer/shipping-addresses/parse`，收一段文字（长度设上限），返回拆好的 9 个字段，**不保存**。前端把结果填进新增弹框，用户检查后自己点保存。
  - 国家由模型给出两位代码，后端按 ISO 列表校验，不认识的就留空。
  - 走现有限流，按用户限次数；地址原文不写进日志和审计。
  - 调研见对话：中国那套规则加行政区划库对欧洲地址没用；libpostal 太重；商业 API 要开账号，而且只拆地址。
- **P4**：每条地址一个「复制」按钮，把整条地址按卡片格式复制成多行文本。**原样复制，不做翻译**：用户填的是什么文字就复制什么。国家那一行库里存的是代码，复制时用卡片上显示的名字（跟界面语言走），和页面上看到的一样。纯前端实现，不涉及后端。

所有待定项都已定，等批准方案。
