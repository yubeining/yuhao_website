# 数据库迁移

Schema 的唯一真源。Hibernate 从不写 DDL（`ddl-auto: validate`）。

## 文件名规则

```
YYYY-MM-DD_NN_slug.sql
```

- **日期** = 编写日期（不是合并日期）。CI 和 pre-commit 拒绝未来日期。
- **NN** = 两位序号 `01`–`99`，**同一天内全局唯一**。
- **slug** = 小写 + 短横线。

### 为什么要 NN

字典序里 `-`(0x2D) < `.`(0x2E)，所以：

```
2026-08-02_foo-extra.sql     ← 会排在前面
2026-08-02_foo.sql           ← 但它其实是先写的
```

顺序反了，而且没人会发现，直到某天在新环境从零建库时报错。
两位序号消除这个歧义 —— 序号即顺序。

## 硬规则

1. **必须幂等** —— 每条 DDL 用 `IF [NOT] EXISTS`。CI 会跑两遍验证。
2. **禁止 `DO $$` 块** —— 迁移执行器按 `;` 切语句，不认美元引号，
   内层的 `;` 会把块切碎，开机报 "Unterminated dollar quote"。
   需要函数就用单引号字符串形式定义函数体，见 `2026-08-02_04_pricing-quote-order.sql`。
3. **已应用的文件不许改** —— 内容 hash 变了会在启动时报漂移错误。
   要么撤销修改，要么新开一个文件。
4. **表改名必须同 PR 配套 `DROP TABLE IF EXISTS old CASCADE`。**
   没有配套删除，后续某个迁移手滑写 `CREATE TABLE IF NOT EXISTS old_name`
   就会把空的旧表又建回来，每个长期环境都留垃圾表。
5. **所有环境跑同一套迁移**，不允许某个环境用 `ddl-auto: update` 绕过。

## 加一个迁移

```bash
# 1. 建文件（今天日期 + 下一个可用序号）
vi database/migrations/2026-08-05_01_add-shipment-tracking.sql

# 2. 同步 database/schema.sql

# 3. 提交（pre-commit 会校验文件名）
git add database/migrations/2026-08-05_01_add-shipment-tracking.sql database/schema.sql
```

下次后端启动时自动应用，`schema_migrations` 表里出现对应记录。

## 建表之前：先答「这张表归哪个域」

CLAUDE.md §2 的模块化单体有一条 **每张表归属唯一的域**，域与域之间不联表查询。
这条规矩只有写下来才守得住 —— 归属如果只存在于某个人的印象里，
第二个人加表时按自己的理解放，两个月后就没人说得清 `xxx_part` 到底谁能改。

**加表的同时在下表加一行。** 答不清归谁就停下来问，别先建（同 CLAUDE.md §4）。

| 表 | 归属 | 谁能写 |
|---|---|---|
| `organization` / `ops_user` / `external_user` / `role` / `user_role` | `platform/identity` | 平台。所有域共用的身份，不属于任何业务域 |
| `app_setting` / `dict` | `platform/dict` | 平台 |
| `customer_order` / `ops_order` / `supplier_order` | `domain/order` | 订单域 |
| `part_design` / `customer_order_part` / `ops_order_part` / `supplier_order_part` | `domain/order` | 订单域 |
| `part_revision` / `part_file` / `part_file_access_log` | `domain/order` | 订单域。图纸挂在零件主数据 `part_design` 下，所以跟着它归订单域；审计表只记零件图纸，不是通用文件审计 |

> ★ **零件表归订单域，不单独开「零件域」。**
> 迁移 `2026-09-08_05` 的注释里写的「订单三个域各一张表」，那里的「域」指业务区块，
> **不是 Java 模块**。设计文档 12 §11 已经明确：四台状态机的转移表全部落在 `domain/order`。
> 理由是文档 12 §0.3 和 §8 要求的向上聚合是**同一个事务内同步完成**的
> （叶子 CAS + 上游回写 + 上游转态，要么全成要么全回滚）——
> 拆成三个模块就得跨模块写对方的表，那正是 CLAUDE.md §2 禁止的。
> 那个注释改不了：迁移已应用，动内容会触发 hash 漂移（见上面硬规则 3）。以本表为准。

价格相关的表**一张都还没定**（建几张、什么形状、什么粒度，见设计文档 13 §2.5）。
只有一条约束是确定的，且它来自 `CLAUDE.md` §2 而不是价格需求：
**价格是价格域的判断，不能往订单域的表上加列** —— `customer_order_part` / `ops_order_part`
属于订单域。价格要按零件行落就自己建表，裸 uuid 指向零件行，显式建索引。

## 当前迁移

| 文件 | 内容 |
|---|---|
| `2026-08-02_01` ~ `2026-08-02_04` | 第一版全量骨架（交易方 / 图纸 / 询价寻源 / 定价报价订单）。**这批表已被 `2026-09-08_03` 全部删除**，文件保留只为让迁移历史可重放 |
| `2026-08-20_01_customer-reference-numbers.sql` | 客户侧参考编号（同上，表已删） |
| `2026-09-07_01_split-ops-user.sql` | 内外用户拆表（同上，表已删） |
| `2026-09-08_01_add-version-columns.sql` | 乐观锁 `version` 列（同上，表已删） |
| `2026-09-08_02_drop-all-foreign-keys.sql` | 删光存量外键（§4 落地） |
| `2026-09-08_03_wipe-all-tables.sql` | **清空重来** —— 业务尚未开写，按新设计重建 |
| `2026-09-08_04_identity-and-config.sql` | 组织 / 内外用户 / 角色 / 配置 / 字典（7 张） |
| `2026-09-08_05_order-and-part-skeleton.sql` | 订单三张 + 零件四张骨架（7 张） |
| `2026-09-09_01_index-part-traceability-columns.sql` | 零件派生链溯源列补索引 |
| `2026-09-10_01_part-quantity.sql` | 三张零件实例表加 `quantity`（一行 = 一批） |
| `2026-09-10_02_part-revision-and-file.sql` | 图纸版本 / 图纸文件 / 图纸访问审计（3 张） |

当前库里共 17 张业务表（另有迁移账本 `schema_migrations`）。

状态机的状态列、价格域的表、质检 / 发货 / 单据 / 结算，都还没建 ——
分别见设计文档 12 §11 和 13 §2，到那一步再加。

## 已存在数据库的接入

如果 `schema_migrations` 是空的但库里已经有表，启动会被保护逻辑拒绝
（防止重复建表）。先把现有文件标记为已应用：

```bash
./scripts/bootstrap-schema-migrations.sh <psql-连接串>
```
