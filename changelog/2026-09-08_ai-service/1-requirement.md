# 需求 —— 统一 AI service

> 提出日期：2026-09-08 ｜ 提出人：项目负责人

## 原话

> 「我需要有统一的 ai service 然后供各个服务调用 …… 你看服务能不能抽象 然后这个能不能调通」
> 「框架接 spring ai alibaba 但是你自己写的 ai service 统一收口」

给了 Sealos aiproxy 的 OpenAI 兼容端点和 api key（示例见聊天记录，key 不入库）。

## 背景

文档 8 的 AI 自动报价要调大模型；将来其他地方（解析清单、生成文案等）也会用。需要一个
**统一入口**，业务只依赖它、不各自对接大模型，换模型/换网关只改一处。

Sealos aiproxy 是 **OpenAI 兼容**端点（`/v1/chat/completions`），一个 key 下 263 个模型可用。

## 技术澄清（已跟老板说明）

Spring AI Alibaba 主打 DashScope，和 OpenAI 兼容端点不对付；而它建在 Spring AI 之上。
所以按"用 Spring AI 生态 + 自己的 AiService 收口"落地，底层用 Spring AI 的 **OpenAI 兼容 client**
（改 base-url 打 Sealos）——这才调得通。

## 验收

1. 自己的 `AiService` 接口统一收口，业务不直接碰底层框架/模型。
2. 底层用 Spring AI 打 Sealos OpenAI 兼容端点，可按请求覆盖模型/温度/maxTokens。
3. key 走环境变量，绝不入库；没配 key 应用仍能启动（不调 AI 就不受影响）。
4. **对真实端点调通**，有可重复的门控测试（有 key 才跑）。

## 关联

- `docs/design/8`（AI 自动报价）
- 复用套路：`StorageService` / `NotificationService`（接口 + 可换实现）
- ★ 安全：key 在聊天里出现过，建议轮换 + 存 GitHub Secrets / DevBox .env
