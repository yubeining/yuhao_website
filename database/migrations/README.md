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

## 当前迁移

| 文件 | 内容 |
|---|---|
| `2026-08-02_01_platform-core.sql` | 交易方 / 用户 / 文件对象 / **图纸访问日志** / 审计 / 访问授权 |
| `2026-08-02_02_part-and-drawing.sql` | 规格模板 / 零件 / **图纸版本** / 图纸文件（原件/脱敏/预览/水印） |
| `2026-08-02_03_rfq-and-sourcing.sql` | 线索 / 询价 / **寻源包（匿名投影）** / 供应商邀请与报价 / 供应商能力库 |
| `2026-08-02_04_pricing-quote-order.sql` | 定价规则 / 汇率快照 / **对客报价（五道护栏）** / 订单 / **生产订单（拆单不变式）** |

Phase 3/4 的表（质检 / 发货 / 单据 / 结算）到那一期再加，现在不建。

## 已存在数据库的接入

如果 `schema_migrations` 是空的但库里已经有表，启动会被保护逻辑拒绝
（防止重复建表）。先把现有文件标记为已应用：

```bash
./scripts/bootstrap-schema-migrations.sh <psql-连接串>
```
