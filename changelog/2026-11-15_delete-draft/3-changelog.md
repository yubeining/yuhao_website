# 变更记录 —— 草稿真删（2026-11-15）

## 后端

| 文件 | 改动 |
|---|---|
| `CustomerOrderController` | 新增 `DELETE /customer/orders/{orderId}`（204） |
| `CustomerOrderService.deleteDraft` | 只允许 DRAFT；按序清理：文件审计 → 对象存储 → 文件行 → 版本 → 零件行 → 订单 |
| `PartFileAccessLogRepository` | `deleteByPartFileIdIn` |
| `PartFileRepository` | `findByPartRevisionIdIn`（含 PENDING/REJECTED） |
| `CustomerOrderPartRepository` | `deleteByCustomerOrderId` |

两个刻意的取舍：

- **零件主数据 `part_design` 保留** —— 它是这家客户的图号库，可能被其它订单复用
- **对象存储删除尽力而为** —— 对象已不在不该让整个删除失败，记 warn 即可

## 前端

- `OrderListPage`：草稿行 `取消订单` → `删除`（`linkbtn` 次级文字），确认文案写明图纸一并删除
- `services`：`cancelOrder` → `deleteOrder`（DELETE）
- `i18n`：`cancelOrder/cancelConfirm` → `deleteOrder/deleteConfirm`

## 验证（真跑）

```
列表 1 行 → 点「删除」→ 确认框 "Delete this draft? Its drawings are deleted too…" → 0 行
order_rows=0  line_rows=0  file_rows=0  revision_rows=0     ← psql 复核
```

另一组：一张已取消 + 一张草稿同时存在 → `pills = Cancelled | Draft`，
只有草稿行有 `Delete`，已取消订单仍显示。

`mvn test` 85 通过，`type-check` / `build` 通过。

## 遗留

- 后端 `POST /customer/orders/{id}/cancel` 接口保留未删（旧客户端/历史数据仍可能用到），
  但界面上已不再有入口
