# 变更记录 —— 日志尾部端点（2026-11-14）

## 功能

- 新增 `GET /actuator/logtail?token=<LOG_TAIL_TOKEN>&lines=200&q=keyword`
- 返回最近日志（默认 200 行，最多 1000），`q` 做子串过滤
- `LOG_TAIL_TOKEN` 未配置时恒 404；token 错误 401；正确 200

## 新增文件

| 文件 | 作用 |
|---|---|
| `platform/diagnostics/LogTailBuffer.java` | Logback 追加器 + 1000 行环形缓冲 |
| `platform/diagnostics/LogTailEndpoint.java` | 只读端点，token 常量时间比较 |
| `test/.../LogTailBufferTest.java` | 缓冲裁剪、过滤、鉴权分支 |

## 改动文件

| 文件 | 改动 |
|---|---|
| `application.yml` | `app.diagnostics.log-token: ${LOG_TAIL_TOKEN:}` |
| `SecurityConfig` | 放行 `/actuator/logtail`（端点自己校验） |

## 部署清单

1. 重新构建镜像（后端代码改动）
2. **给应用加环境变量 `LOG_TAIL_TOKEN=<随机长串>`**，否则端点返回 404
3. 重启 pod 生效
4. 验证：`curl "https://www.partcut.com/actuator/logtail?token=...&lines=5"`

## 安全边界（必须知道）

- 日志里有打码邮箱、订单号、IP —— **这是内部数据**
- 端点默认关闭，属于「临时排查」工具；问题查完建议删掉环境变量重启
- token 泄露 = 任何人都能读最近日志，用 32 位以上随机值，别用可猜的单词
- 多副本时每个 pod 各有一份缓冲，看到的是其中一个副本

## 验证

- `mvn test -Dtest=LogTailBufferTest` 4 个通过
- 本地启动带 `LOG_TAIL_TOKEN=devtoken123`：
  - 无 token → 404、错 token → 401、对 token → 200 并返回日志行

## 遗留项

- 日志不持久，进程重启即清空；长期方案应接日志服务（Loki/云日志），不在应用内做
- 没有做请求级鉴权日志（谁在读日志），后续接入审计时补
