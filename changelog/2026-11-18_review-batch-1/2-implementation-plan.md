# Review 第一批修复 —— 实施方案（2026-11-18 获批）

每项先写复现测试（RED），再改代码（GREEN）。

1. **删草稿**：`CustomerOrderService.deleteDraft` 只清理 `disposableRevisionIds` —— 未锁定且没有别的订单行引用的版本。
2. **密码注册**：`app.auth.password-register-enabled`，默认 false → `POST /auth/register` 返回 404；
   `application-test.yml` 打开（13 个集成测试靠它建账号），生产行为由 `PasswordRegisterDisabledIT` 钉住。
3. **上传固定**：`StorageService.copy`（S3 CopyObject / 内存实现）；`PartDrawingService.complete` 先复制到新 key，
   类型校验和大小都以副本为准，成功后行指向新 key、删除上传用的 key。
4. **验证码预算**：`OtpService.send` 里已注册邮箱跳过全局每日预算，仍受每邮箱每小时 20 次限制。
5. **供应商列表**：`DispatchLineDetails.Row` 带上叶子行自己的 `partDesignId`，上游不在时只出图号 / 件数 / 状态。
6. **AI 估价校验**：`AiEstimate.validate()`；金额超过 numeric(12,2) 上限拒绝；毛坯重 0 标为缺数量。
7. **AI 估价资源**：`DrawingImages.MAX_IMAGE_PIXELS`；`spring.ai.openai.timeout=60s`、`max-retries=0`、
   `spring.ai.retry.max-attempts=1`；`EstimateService.MAX_CONCURRENT=2`；`OrderQuotingService.readForEstimate` 判订单状态。

## 被否决 / 没做的

- **直接删掉密码注册接口**：13 个集成测试靠它建账号，改成开关。
- **验证码预算只调大数字**：需求方选了「已注册邮箱豁免」。
- **监控指标接口**：需求方决定不改。

## 工程取值（不是业务规则）

模型超时 60 秒；同时估算 2 个；图片像素上限 4000 万。
