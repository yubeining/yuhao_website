# 变更记录 —— 统一 AI service

> 2026-09-08 ｜ 平台层新增 ｜ 无 schema、无 domain

## 新增 `platform/ai/`

- `AiService` 接口（统一收口）+ `AiRequest` / `AiResult` 记录 + `AiException`。
- `SpringAiService`：Spring AI 实现，用 OpenAI 兼容 `ChatModel` 打 Sealos aiproxy；
  每次请求可覆盖 model / temperature / maxTokens；返回内容 + 实际模型 + token 用量。
- 本轮只做单轮 chat；流式 / 结构化输出（文档 8 报价要的基准价+置信度+区间）/ 工具调用按需再加。

## 依赖 / 配置

- `pom.xml`：加 `spring-ai-bom:1.0.0` + `spring-ai-starter-model-openai`。
- `application.yml`：`spring.ai.openai.base-url`（默认 Sealos aiproxy）/ `api-key`（环境变量，
  未配用占位符让上下文能启动）/ 默认模型 `deepseek-chat` / temperature 0.2；关掉 embedding 自动装配。
- `.env.example` / `.env`：加 `AI_BASE_URL` / `AI_MODEL` / `AI_API_KEY`（**key 不入库**）。

## 技术说明

- 老板提的 **Spring AI Alibaba 主打 DashScope，打不通这个 OpenAI 兼容端点**；改用 Spring AI
  的 OpenAI 兼容 client（同一生态的核心）。对外仍是我们自己的 `AiService`，将来换实现不影响业务。

## 验证（跑过）

- **对真实 Sealos 端点调通**：`AiServiceIT` 2 例（真发 chat 返回 PONG + 带 token 用量；
  便捷 `ask` 有返回）。key 从环境 `AI_IT_KEY` 读，不入库；CI 无 key 自动跳过。
- 无 key 全上下文启动正常（占位 key，Spring AI 自动装配不崩）；`mvn verify` 全绿。
- 端点探活：`/v1/models` 返回 263 个模型；`deepseek-chat` / `qwen-turbo` / `glm-4-flash` 实测均正常。

## 部署清单

- 无迁移。要真用 AI：GitHub Secrets 加 `AI_API_KEY`（+ 可选 `AI_MODEL`），部署时覆盖进 DevBox `.env`
  （复用现有 secrets→.env 机制，把 AI_API_KEY 加进 workflow 的密钥列表）。
- ★ 未配 key 时应用照常启动，只是调 AI 会失败 —— 不影响其他功能上线。

## 遗留项 / 安全

| # | 事项 |
|---|---|
| 1 | ★ api key 在聊天里出现过，建议**轮换**，并只存 GitHub Secrets / DevBox `.env` |
| 2 | workflow 的 secrets→.env 列表还没加 `AI_API_KEY`（要线上用 AI 时加） |
| 3 | 结构化输出 / 流式 / 重试超时调优，等 AI 报价真做时按需加 |
| 4 | AI 调用的降级预案（AI 不可用不能卡死报价流程）在业务侧做，文档 8 已有"转人工"兜底 |
