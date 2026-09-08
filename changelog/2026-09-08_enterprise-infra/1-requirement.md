# 需求 —— 借鉴 WeAct/webox 的 8 项企业级基建

> 提出日期：2026-09-08 ｜ 提出人：项目负责人

## 原话

先让我调研 WeAct 和 webox 两个生产项目有哪些基建/架构值得借鉴，输出对照表后：

> 「ArchUnit 架构测试  AI 多 provider 抽象  Prometheus 指标  typed 配置树
> @Idempotent 幂等注解  每子系统独立线程池  集成测试基类  声明式审计 @AuditLog + 脱敏
> 这些你都学习做一下」

## 背景

WeAct（533k LOC）和 webox 的地基精华 mfg 大多已吸收（响应外壳、迁移体系、端级闸门、
Redis 服务、乐观锁、BaseEntity……）。这 8 项是两家有、mfg 还没有、且值得补的差量。

## 验收（8 项）

1. **Prometheus 指标** —— 暴露 `/actuator/prometheus`，拆 liveness/readiness 探针，公共标签。
2. **ArchUnit 架构测试** —— 把 CLAUDE.md 铁律（禁 JPA 关联、构造器注入、禁 System.out、分层）写成会失败的测试。
3. **每子系统独立线程池** —— 慢的外部 I/O（通知）用独立池，隔离爆炸半径。
4. **集成测试基类** —— 统一真库真 Redis + 每测试清理，去掉各 IT 的重复。
5. **@Idempotent 幂等注解** —— Redis 抢占，挡重复提交，失败可重试。
6. **@AuditLog + 脱敏** —— 声明式审计落 audit_event；日志脱敏工具。
7. **AI 多 provider 抽象** —— AiProvider 接口 + registry，"加一个 provider 一个类"（对上"其他 AI 后续接入"）。
8. **typed 配置树** —— @ConfigurationProperties 收口散落的 @Value（先迁最典型的几组）。

每项都要有测试或运行时验证。

## 关联

- 调研来源：`/Users/yubeining/webox/weact`、`/Users/yubeining/webox/webox/webox-backend`
- 现有借鉴清单：`docs/design/4-WeAct架构借鉴清单.md`
