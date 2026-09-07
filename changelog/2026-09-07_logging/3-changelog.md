# 变更记录 —— 日志：轮转 + 请求追踪

> 2026-09-07 ｜ 平台层 + 部署脚本 ｜ 无 schema、无业务代码

## 为什么没有 2-implementation-plan.md

改动小且方向单一（配置 + 一个 filter + 部署脚本三行）。判据「光看 diff 会不会对为什么留疑问」——
不会，理由都写在配置注释和 filter 类注释里。

## 改了什么

**日志轮转（Spring Boot 内置滚动策略，不手写 logback XML —— 少踩坑）**
- `application.yml`：`logging.file.name=${LOG_PATH:logs}/app.log` 打开文件 + 轮转；
  `logging.logback.rollingpolicy`：单文件 50MB、保留 14 天、归档总量封顶 2GB；
  `logging.pattern.correlation="[%X{traceId:-}] "` 把 traceId 注进控制台和文件两套 pattern。
- `application-test.yml`：日志文件指到 `target/test.log`，测试不在 `logs/` 留垃圾。
- `.gitignore`：加 `logs/`（轮转出来的 `.log.gz` 归档）。

**请求追踪**
- `platform/observability/RequestTraceFilter`（OncePerRequestFilter，HIGHEST_PRECEDENCE，
  跑在 Security 链之前）：读 `X-Request-Id`（消毒后沿用）或生成 16 位 hex → MDC `traceId`
  → 回写响应头 → finally 清 MDC（线程池复用防串味）。

**部署脚本**
- `deploy/devbox/deploy.sh`：app.log 现在由 Logback 自己写并轮转，所以 `nohup` 改成重定向到
  `boot.log`（只接 JVM 崩溃 / OOM / Logback 起来之前的输出），并给 java 传 `-DLOG_PATH=$LOG_DIR`
  让 app.log 落在绝对路径；失败时 app.log 和 boot.log 都 tail 一段。

## 验证（真跑过）

全套测试绿：`AccessInterceptorTest 4 / MemoryStorageServiceTest 5 / PortalGuardIT 7`，BUILD SUCCESS。

打包后在容器里真启动（挂 /logs 出来看）：

```
# 响应头证明 filter：
X-Request-Id: my-trace-123            ← 上游传入，原样沿用
X-Request-Id: 828c63125b70427f        ← 未传入，自动生成 16 位

# app.log 生成，请求内日志带上 traceId：
2026-09-07T09:52:48.254Z  WARN 1 --- [mfg-backend] [http-nio-3003-exec-7] [demo-trace-abc] c.mfg.platform.auth.DevAuthController : dev login issued for partyType=CUSTOMER

# 非请求日志（启动/框架）traceId 槽为空 []，符合预期
```

## 部署清单

- 无迁移、无配置密钥。合并后下次部署生效。
- 首次用新 deploy.sh 部署后，`/home/devbox/app/logs/` 下会出现 `app.log`（Logback 轮转）+
  `boot.log`（nohup）。老的单个大 app.log 会被 Logback 接管并从此开始轮转。

## 遗留项

| # | 事项 |
|---|---|
| 1 | traceId 目前是纯 MDC 文本关联；将来若上分布式追踪（Micrometer Tracing / OTel），可平滑替换成 trace/span，pattern 不用大改 |
| 2 | `AuditService` 的 `OffsetDateTime`→`Instant`、审计改 `REQUIRES_NEW` 独立事务 —— 做图纸域（红线 1 落 file_access_log）时一起改 |
