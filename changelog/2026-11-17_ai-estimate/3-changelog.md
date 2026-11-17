# AI 成本估算 —— 变更记录

## 数据库（迁移 `2026-11-17_01_cost-estimate.sql`）

- 新表 `cost_rate`（费率表，含手册第二章 37 条初始值，区间取中值、原文在 note）。
- 新表 `price_estimate`（每次估算一行，只插不改；快照输入、整张费率表、AI 原始输出、明细）。
- `part_file_access_log.access_type` 加 `READ_FOR_AI`（只加枚举值，旧版本兼容）。
- `schema.sql` 是手工按 pg_dump 格式补的 —— 本机 Docker 起不来，没能跑 `scripts/dump-schema.sh`。

## 后端

- `platform/ai`：`AiRequest` 可带图片（`AiImage`），`SealosAiProvider` 把图片作为 media 发出。
- 新依赖 PDFBox 3.0.5：PDF 图纸转 PNG。
- 订单域契约 `OrderQuoting.readForEstimate`：校验行属于该单 → 每读一份落审计 → 返回内容。
- 报价域：`EstimateCalculator` / `DrawingImages` / `EstimateService` / `CostRateService` / `OpsEstimateController`；提示词在 `resources/prompts/cost-estimate.txt`。
- 配置 `app.estimate.model`（环境变量 `AI_ESTIMATE_MODEL`，默认 `qwen3.8-flash`）。
- 接口：`POST /ops/customer-orders/{orderId}/lines/{lineId}/estimates`、`GET /ops/customer-orders/{orderId}/estimates`、`/ops/cost-rates` 增删改查。

## 前端

- 报价工作台新增「AI 成本估算」卡片（`EstimateCard`），明细在弹框里。
- 新页面 `/ops/cost-rates` 费率表，左侧导航「费率表」。

## 验证

- `mvn test`：113 个测试全过（新增 21 个：计算 10、图纸转图 5、估算流程 6）。
- `npm run build`：通过。
- **没跑** `mvn verify`（集成测试）：本机 Docker 起不来。迁移也没在本地库上实际执行过。
- **没验证**：qwen3.8-flash 是否支持看图、真实图纸的估算效果、模型耗时是否超过网关超时 —— 只能部署后在线上点一次。

## 部署清单

- 无需新增环境变量（模型名有默认值）；想换模型设 `AI_ESTIMATE_MODEL`。
- 开机自动跑迁移。

## 历史案例回归（2026-11-17）

- 没有客户原图纸，只回归了「代码算钱」：把案例里人工定的数量当 AI 输出喂给计算器。
- RFQ 4501415049 三件：-1.8% / +1.2% / -1.1%；Dräger 7067141/2：约 -37%。
- -37% 来自数量系数重复打折：手册 §3.2 公式以单件为基准，但手册自己的案例（080 两件、Dräger 200/1200 件）
  都是人直接给该数量下的工时、没套曲线。**工时口径待需求方定**，本次不改。
- 修了一处明显错误：提示词让 AI 给「整行」固定费，计算器却当每件金额加进每件成本。改成「单件试制时一件承担的固定费」，
  与手册 §3.2 的 固定费 × f_fix 一致。

## 遗留

- `EstimateServiceTest` 是在实现之后补写的，不是先写测试。
- 估算结果和供应商实际接单价的对比回流（设计文档 8 `price_feedback`）没做。
- 钣金、管件等其他零件类型没做。
