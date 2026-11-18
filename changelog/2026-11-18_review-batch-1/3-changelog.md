# Review 第一批修复 —— 变更记录

## 改动

- `domain/order/CustomerOrderService` + `CustomerOrderPartRepository`：删草稿不再删已锁定 / 被别的订单引用的图纸版本。
- `platform/auth/ExternalAuthController`：密码注册默认关闭；`application-test.yml` 打开。
- `platform/storage/{StorageService,S3StorageService,MemoryStorageService}`：新增 `copy`。
- `domain/order/{PartDrawingService,PartFileRepository,PartFile}`：上传完成时把对象挪到新 key。
- `platform/auth/OtpService`：已注册邮箱不占每日发信预算。
- `domain/order/{DispatchLineDetails,SupplierOrderViews}`：上游行被删后的供应商订单仍能列出。
- `domain/quote/{AiEstimate,EstimateCalculator,EstimateService,DrawingImages}`：模型输出校验、像素上限、并发上限。
- `domain/order/{OrderQuoting,OrderQuotingService}`：只有已提交 / 已报价的单能估价。
- `application.yml`：模型调用 60 秒超时、不重试。
- `portal/src/i18n/strings.ts`：`estimate.busy` 文案。

## 已知代价 / 遗留

- **验证码预算豁免带来一个探测口**：预算刷满期间，已注册邮箱返回 200、未注册返回 429，可据此判断邮箱是否注册过。
  平时（预算没满）两者响应仍然一致。
- **存量账号没处理**：关接口之前已经用密码注册的账号不动。
- **上传固定依赖对象存储的 CopyObject**：Sealos 对象存储上没实测过，上线后要实传一张图验证。
  复制失败时 complete 会报错，图纸传不上去。
- **PDF 里嵌超大图片**的内存风险还在；只挡了单张图片文件。
- 取消的供应商订单里找不回上游的行，名称 / 材料 / 图纸为空，只有图号、件数、状态。
- 监控指标接口 `/actuator/prometheus` 仍对公网开放（需求方决定不改）。

## 部署清单

- 无新增环境变量、无迁移。
- 想在某个环境临时打开密码注册：`APP_AUTH_PASSWORD_REGISTER_ENABLED=true`（生产不要开）。
