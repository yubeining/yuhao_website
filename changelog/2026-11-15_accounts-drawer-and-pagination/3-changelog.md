# 变更记录 —— 账号管理抽屉 + 全站分页（2026-11-15）

## 通用组件

| 文件 | 说明 |
|---|---|
| `components/Pagination.tsx` | 统一分页控件：页码窗口化、只有一页时不渲染 |
| `components/Drawer.tsx` | 右侧抽屉：Esc/点遮罩关闭、锁滚动、busy 时禁提交 |
| `common/dto/PagedResponse.slice(...)` | 内存分页：视图本来就整表聚合，拿到最终列表后统一切页 |

## 账号管理（`ops/AccountsPage`）

- 外部用户：**去掉「新建」**（客户/供应商都自助注册，运营只改姓名、禁用/启用）；编辑走抽屉，邮箱/公司只读
- 组织 / 运营账号：新建/编辑走抽屉；组织「国家」字段改下拉（去掉了矛盾的「两位代码，可选」文案）
- 三个子页搜索栏统一 `.fbar` 布局、回车可查、每页 20 条

## 分页接入（后端 + 前端）

| 接口 | 改动 |
|---|---|
| `/ops/dispatch/pool` `ops-orders` | service 返回 `PagedResponse`（内存切片） |
| `/ops/production` | 同上 |
| `/supplier/offers` `/supplier/orders` | 同上 |
| `/ops/suppliers` | 同上 |

前端：`OrderListPage`、`QuoteListPage`、`QuotesPage`、`DispatchPage`（池 + 生产订单两个列表）、
`ProductionPage`、`PartiesPage`、`HallPage`、`supplier/OrdersPage` 全部接 `Pagination`，
`list*` 服务函数改为 `(page, pageSize=20)` 返回 `PagedResponse`。

> 派单页的「拆单」面板需要列出**全部**组装中生产订单，所以 `assembling` 单独全量拉取（200 条），
> 不被分页切掉 —— 这是功能正确性要求，不是偷懒。

## 顺带修掉的测试

- `DispatchFlowIT` / `SupplierDirectoryIT`：断言从 `data` 数组改成 `data.items`
- `OtpLoginFlowIT`：原来按「5 次/小时」写，而限流早已提到 20 次 —— 改成 20 次后第 21 次 429

## 验证（真跑）

```
用户页：新建按钮 = 0，搜索行 = "邮箱 | 查询"（对齐）
组织页：分页 = "26 items | 上一页 | 1 | 2 | 下一页 | 第 1/2 页"，每页 20 行
新建组织 → 右侧抽屉 title = "新建组织"
mvn test 92 通过；mvn verify 150 通过（5 个跳过为 S3/AI 等既有跳过）
type-check / build 通过
```

## 遗留

- `createAccount`（后端 `POST /ops/users`）仍在，但前端已不调用 —— 代建外部用户这条入口按需求关闭，
  接口暂留，后续确认是否删后端
- `QuoteListPage` 的「待报价」区块仍一次性拉 200 条（次要提示区，不单独分页）
