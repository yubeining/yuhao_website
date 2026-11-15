# 变更记录 —— 运营 / 供应商图纸预览（2026-11-15）

## 后端

| 端点 | 说明 |
|---|---|
| `GET /ops/customer-orders/{orderId}/lines/{lineId}/files/{fileId}/preview-url` | 新增：归属校验 + 审计，签名不带 attachment |
| `GET /supplier/offers/{id}/lines/{lineId}/files/{fileId}/preview-url` | 新增 |
| `GET /supplier/orders/{id}/lines/{lineId}/files/{fileId}/preview-url` | 新增 |

- `OpsCustomerOrderService.lineFilePreviewUrl`、`SupplierOfferService.offerFilePreviewUrl` /
  `orderFilePreviewUrl`：和下载同一条校验路径，只换签名方式
- `SupplierOfferService.issue(...)` 加 `preview` 参数，避免复制两遍校验

## 前端

- 报价工作台：图纸「查看」→ `FilePreviewModal`（PDF iframe / 图片 img）
- 供应商派单详情、我的订单：同样改成预览弹层
- 弹层里的「下载」才调带 attachment 的 view-url
- 不可预览的扩展名按钮禁用，悬浮提示原因

## 验证

```
mvn verify 151 通过（QuoteFlowIT 增加 preview-url 断言：200 + 审计落行）
浏览器（本地运营账号）：
  点图纸「查看」：.fp-modal = 1、iframe = 1、URL 未变、downloads = 0
  弹层标题 = drawing.pdf
```
