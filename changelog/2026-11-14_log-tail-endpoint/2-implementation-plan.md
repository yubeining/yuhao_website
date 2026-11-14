# 实施计划 —— 日志尾部端点（2026-11-14）

## 方案

1. `LogTailBuffer`：Logback 追加器 + 环形缓冲，保留最近 1000 行
2. `LogTailEndpoint`：`GET /actuator/logtail?token=&lines=&q=`，token 走常量时间比较
3. `application.yml`：`app.diagnostics.log-token: ${LOG_TAIL_TOKEN:}`
4. `SecurityConfig`：放行 `/actuator/logtail`（端点内部自己校验 token）
5. 单测覆盖：缓冲裁剪、关键字过滤、无 token → 404、错 token → 401、对 token → 200

## 关键取舍

- **放在 `/actuator` 下，用 `@Controller` + `@ResponseBody`**：项目给所有 `@RestController`
  自动加 `/api/v1` 前缀（`WebMvcConfig` 的 `HandlerTypePredicate`）。用 `@RestController`
  会变成 `/api/v1/actuator/logtail`，还会被受众拦截器扫到 —— 运维出口不该走业务前缀。
- **状态码用返回值给，不抛 `ResponseStatusException`**：全局异常处理器会把未识别异常统一成 500，
  「没配置」就变成 500 而不是 404。
- **不落文件、不分页、不持久**：这是排查窗口，不是日志归档。要归档应该接 Loki/云日志，
  而不是在应用里造一套日志存储。

## 被否决的方案

- **`logging.file.name` + `/actuator/logfile`**：需要写盘，pod 重建即丢，且只给整段日志不好过滤。
- **kubectl 直连**：需要把集群 kubeconfig 放到开发机，权限过大（能给整个集群做任何事），
  为看日志付出这个代价不值。
- **接第三方日志服务（Loki / 云日志）**：长期正确，但要新增基础设施与账号，当天解不了燃眉之急。
