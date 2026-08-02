# 变更记录 —— Sealos 一键部署

## 新增

```
Dockerfile                        三阶段构建，前后端单一镜像
.dockerignore
deploy/README.md                  ★ 部署指南（建库 / 初始化 / Secrets / 触发）
deploy/devbox/bootstrap.sh        一次性初始化 DevBox
deploy/devbox/deploy.sh           每次部署执行，含健康检查与自动回滚
.github/workflows/deploy.yml      手动触发的部署流水线
```

## 修改

| 文件 | 改动 | 原因 |
|---|---|---|
| `application.yml` | `server.port: ${SERVER_PORT:3001}` | DevBox 对外是 8080。端口写死的表现是「容器起来了但访问不通」，日志一切正常，最容易查错方向 |
| `application.yml` | `server.shutdown: graceful` + `timeout-per-shutdown-phase: 20s` | 部署重启时给在途请求收尾时间，否则正在提交的报价直接连接中断 |
| `code-quality.yml` | `push` 分支加上 `main` | 原本只有 `dev`，直接推 main 一道闸门都不跑，而且没有任何迹象提示 |
| `code-quality.yml` | 去掉 `npm test`，加上 `npm run build` | `package.json` 里没有 `test` 脚本，那一步必然以 "Missing script: test" 失败。前端还没有测试运行器，与其放个假装通过的空脚本掩盖，不如明确留空 |
| `code-quality.yml` | Node 20 → 22 | 与开发和 Dockerfile 对齐 |
| `README.md` | 加「部署」章节 | — |

## 部署链路

```
GitHub Actions（手动 Run workflow）
  ├─ npm ci && npm run build     ← tsc -b 类型检查是构建的一部分
  ├─ mvn clean package -DskipTests
  ├─ ★ 校验 jar 内容
  │    BOOT-INF/classes/static/index.html
  │    BOOT-INF/classes/db/migrations/*.sql
  ├─ scp app.jar → DevBox:/home/devbox/app/app.jar.new
  └─ ssh 'bash deploy.sh'
       ├─ 读 DevBox 本地 .env（★ GitHub 从不接触这些值）
       ├─ SIGTERM 停旧进程，等 30s 再 KILL
       ├─ 备份当前 jar 为 app.jar.prev
       ├─ 起新进程，轮询 /actuator/health 最多 120s
       └─ 不健康 → 回滚 app.jar.prev → 重启 → 【仍以非 0 退出】
```

## 安全边界

**GitHub 侧只有一把 SSH 私钥。**`DB_PASSWORD` / `JWT_SECRET` 只存在于
DevBox 上的 `/home/devbox/app/.env`（权限 600）。GitHub token 泄露不会连带泄露数据。

**`DEV_LOGIN_ENABLED` 在 `.env` 模板里显式写成 `false` 并附了后果说明。**
它是不校验凭据就能签 OPERATOR token 的后门。

**`known_hosts` 可固定。**未设 `DEVBOX_KNOWN_HOSTS` 时退化成 `ssh-keyscan` 现扫，
workflow 会打 warning 并把扫到的内容打印出来，方便一次性固定。

## 验证输出

```
$ docker build -t yuhao:local .
  第一次失败：stage-2 的 apt-get 被代理挡住（400 Bad Request）。
  移除运行时阶段的 apt 依赖后重建 → 成功，镜像 734MB。

$ docker run -p 18080:8080 -e DB_URL=... -e DEV_LOGIN_ENABLED=false yuhao:local
  /actuator/health              200  {"status":"UP"}
  /api/v1/public/ping           200
  /                             200  text/html      ← SPA 外壳在 jar 里
  /ops/dashboard                200  text/html      ← SpaForwardController 生效
  POST /api/v1/auth/dev-login   404                 ← 后门确认关闭（bean 不存在）
  docker exec id                uid=1001(app)       ← 非 root
  SERVER_PORT                   8080                ← 端口覆盖生效
  迁移                           schema up to date（连的是本地已建好的库）

$ bash -n deploy/devbox/deploy.sh      ✓
$ bash -n deploy/devbox/bootstrap.sh   ✓
$ workflow YAML 结构检查                ✓  jobs=[deploy]
$ 四道提交闸门                          ✓ 全过
```

## 遗留项

1. **部署链路本身尚未端到端跑过** —— 需要 DevBox 的 SSH 私钥和主机信息
   配成 GitHub Secrets 之后才能真正触发一次。
2. **DevBox 里装了什么还没确认** —— `bootstrap.sh` 假设了 `apt-get` 可用、
   路径是 `/home/devbox/`。第一次跑 `bootstrap.sh` 会验证这些假设。
3. **日志无轮转**，`logs/app.log` 会一直长。
4. **单实例、无零停机**。需要滚动更新时换 App Launchpad —— `Dockerfile` 已就绪，
   只需再加一个推 `ghcr.io` 的 workflow。
5. **`hub.bja.sealos.run` 私有仓库没用上**。那是 DevBox「发布版本」在用的，
   凭据不直接暴露，Actions 推不上去。
