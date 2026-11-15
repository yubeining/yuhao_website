# 需求 —— 放宽图纸允许的格式（2026-11-15）

> 需求原话：「图纸上传 .docx 不支持吗」→「需要的 格式条件放宽」

## 现状

白名单只有 `STEP,STP,IGES,IGS,X_T,SLDPRT,DWG,DXF,PDF,ZIP`。`.docx` 传上去会被
`complete` 阶段的类型校验拒掉（`400 part.file_type_not_allowed`）。

## 决定

放宽到「CAD + PDF + 压缩包 + 随件文档 + 图纸照片」：

`DOC` `DOCX` `XLS` `XLSX` `PPT` `PPTX` `PNG` `JPG` `JPEG` 新增，
原有 CAD / PDF / ZIP 保留。

## 约束（不能为了放宽就不验）

- OOXML（docx/xlsx/pptx）必须验到**具体格式**，不能只认「是个 zip」
- 老式 `.doc/.xls/.ppt` 是 OLE2 容器，最多验到容器，和 SLDPRT 同等对待，如实记录
- 改扩展名混过去仍然要被拒（例如 .docx 里装 PDF 字节）
