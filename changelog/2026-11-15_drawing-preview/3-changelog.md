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

## 补充（同日）：预览变成"下载"且渲染空白

现场反馈：点「预览」直接下载、弹层一片空白。

### 根因

对象存储里的文件 Content-Type 是 `application/octet-stream` —— 上传时前端传的
`file.type` 是空串（从网盘/微信下载来的 PDF 很常见），后端就落了个八位字节流类型。
浏览器见到未知类型 + 没有 inline 声明，只会下载，iframe 自然空白。

### 修法

1. 新增 `StorageService.presignedPreview(key, ttl, contentType)`：
   签名时显式带 `response-content-disposition: inline` 与 `response-content-type`，
   **覆盖对象自身元数据** —— 已经传错类型的老文件也能正常预览，不用重传。
2. 上传时按扩展名补类型：`file.type` 为空时用 `previewContentType(filename)`
   （pdf/png/jpg/jpeg/webp/gif），不再一律 octet-stream。
3. 弹层顶部加「新窗口打开」作为兜底（少数浏览器不支持内嵌 PDF）。

### 验证

```
preview response: 200 content-type= application/pdf disposition= undefined
```
（无 `content-disposition: attachment` 即为内嵌）

注：无头 Chrome 没有 PDF 查看器，截图里弹层仍是空白 —— 这是无头环境的限制，
不代表真实浏览器。真实浏览器里该 URL 会被内置查看器接管。
