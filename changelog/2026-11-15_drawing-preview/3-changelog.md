# 变更记录 —— 图纸预览 + 附件区改版（2026-11-15）

## 后端

| 文件 | 改动 |
|---|---|
| `PartDrawingService` | 新增 `issuePreviewUrl`：签名 GET **不带 attachment**，仍写访问审计 |
| `CustomerPartController` | 新增 `GET /customer/files/{fileId}/preview-url` |
| `SecurityConfig` | CSP 增加 `frame-src 'self' <对象存储域>`（原来 `object-src 'none'` 且无 frame-src，iframe 会被浏览器拦） |

## 前端

| 文件 | 改动 |
|---|---|
| `components/FilePreviewModal.tsx` | 新增：PDF 用 iframe、图片用 img，Esc / 点遮罩关闭 |
| `pages/customer/PartFormPage.tsx` | 附件区改行式；上传中一行显示进度；接预览 |
| `services/customer/orders.ts` | `filePreviewUrl(fileId)` |
| `styles.css` | `.fileRow` / `.fp-*` 样式 |
| `i18n` | 新增 `预览` / 预览不可用说明 |

## 关键点

- **预览和下载必须是两个 URL**：下载带 `Content-Disposition: attachment`，浏览器会直接存盘；
  预览若带同一个头，弹层里就变成"下载了一个 PDF"。后端因此拆成 `view-url` 与 `preview-url`。
- 预览同样写 `part_file_access_log`，不是免费访问。

## 验证（真跑）

```
上传 probe.pdf + probe.step
rows = 2，preview 按钮 = 2，其中 disabled = 1（STEP）
点预览 → 弹层出现，iframe src = 签名 URL
按 Esc → 弹层关闭（modal after esc = 0）
```

`mvn test` 85 通过、`type-check`、`build` 通过。

## 遗留

- 运营端 / 供应商端的附件区仍是旧 chip 样式（本次只改客户端），后续可复用同一套行式组件
- STEP / DWG 的 3D 预览需要转换服务（OCCT / ODA），不在本次范围
