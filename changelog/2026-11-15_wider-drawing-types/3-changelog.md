# 变更记录 —— 放宽图纸格式（2026-11-15）

## 改动

| 文件 | 改动 |
|---|---|
| `application.yml` | `allowed-drawing-types` 增加 DOC/DOCX/XLS/XLSX/PPT/PPTX/PNG/JPG/JPEG |
| `DrawingTypeGuard` | `TIKA_TYPES` 由 `Map<String,String>` 改为 `Map<String,Set<String>>`（OLE2 可能报容器也可能报具体类型，两种都接受）；新增「容器类带文件名再判一次」 |
| `PartDrawingService.previewContentType` | 补上 Office 的 Content-Type，避免存成 octet-stream |
| `docs/design/2-系统架构.md` | 允许清单同步 |
| `DrawingTypeGuardTest` | 新增 5 个用例（docx / xlsx / png / 伪造 docx / 老式 doc） |

## 关键点：zip 容器要带文件名再看一次

`tika.detect(bytes)` 对 OOXML 只报容器类型（`application/x-tika-ooxml` 或 `application/zip`），
分不出是 docx 还是 xlsx。所以只在**容器类型**上回退到 `tika.detect(bytes, filename)`，
让它按包内 `[Content_Types].xml` 细化；普通格式仍然只认字节，避免「改个扩展名就过」。

## 验证（真跑）

```
rows = DOCX sample.docx 36 KB | XLSX sample.xlsx 5 KB | EXE bad.exe → File type not supported…
preview disabled = 2     ← docx/xlsx 不能内嵌渲染，预览置灰
```

`mvn test` 90 通过（新增 5 个类型用例）。
