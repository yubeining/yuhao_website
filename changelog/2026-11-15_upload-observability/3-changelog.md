# 变更记录 —— 上传耗时埋点（2026-11-15）

## 改动

1. `PartDrawingService` 新增两条日志：
   - `part.file.presign fileId=… ttlSeconds=…`（发签名 URL 时）
   - `part.file.upload_completed fileId=… sizeBytes=… elapsedMs=… throughputKBps=…`
     （文件进桶、校验通过后；耗时 = 现在 − `part_file.created_at`，也就是从发 URL 到传完）
   - 只记 fileId 与大小，不记文件名（避免客户图纸名进日志）
2. 签名 URL 有效期 `900s → 1800s`（可用 `STORAGE_SIGNED_URL_TTL_SECONDS` 覆盖）

## 为什么用这个办法

浏览器直传对象存储，服务端看不到传输过程；但「发签名 URL」与「传完回调」两个时刻都在服务端，
两者之差就是真实传输耗时。有了它，下一次上传就能直接算出吞吐，不需要用户开 DevTools。

## 验证（本地真跑）

```
part.file.presign fileId=eef59340… ttlSeconds=1800
part.file.upload_completed fileId=eef59340… sizeBytes=193 elapsedMs=92 throughputKBps=2
```

`mvn test` 85 通过。

## 下一步（等数据）

部署后让用户正常上传一次，用 logtail 读这两条日志：
- 吞吐 ≈ 30KB/s 且本机直连对象存储有 3MB/s → 问题在用户到网关这段链路
- 吞吐正常但页面仍慢 → 问题在回调后的前端流程，另查
