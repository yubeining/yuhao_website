# 实施计划

## 新增文件

| 文件 | 作用 |
|---|---|
| `Dockerfile` | 三阶段：前端 → 后端 → JRE 运行时。本次不走这条路，但本地对齐和将来换 App Launchpad 都要它 |
| `.dockerignore` | 排除 node_modules / target / **host 上的 static/** |
| `deploy/README.md` | 建库 → 初始化 DevBox → 配 Secrets → 点 Actions |
| `deploy/devbox/bootstrap.sh` | 一次性：装 JRE 21、建目录和 `.env`、装 entrypoint |
| `deploy/devbox/deploy.sh` | 每次部署：停旧 → 换 jar → 起新 → 健康检查 → 失败回滚 |
| `.github/workflows/deploy.yml` | 手动触发的部署流水线 |

## 五个关键取舍

### 1. 密钥不进 GitHub

Actions 只送 jar，从不接触 `DB_PASSWORD` / `JWT_SECRET` ——
那些值只存在于 DevBox 上的 `/home/devbox/app/.env`。
GitHub 侧只有一把 SSH 私钥，泄露的爆炸半径小得多。

### 2. 只有 workflow_dispatch，没有 push 触发

部署是**决定**不是副作用。自动部署 main 意味着任何一次手滑推送直接进生产。
等有了预发环境和能挡住回归的测试再谈自动化。

### 3. 健康检查不过就自动回滚，但 Actions 仍然显示红色

回滚只是止血，不是部署成功。绿色会让人以为这次改动上线了。

健康探测优先用 `curl` / `wget` 打 `/actuator/health`，都没有才退化成 TCP 探测 ——
**TCP 通 ≠ 应用就绪**：迁移跑到一半时端口可能已经开了。

### 4. 用 entrypoint.sh 而不是 systemd

DevBox 是容器不是虚拟机，通常没有 systemd。
没有 entrypoint，DevBox 一被暂停/重启，应用就再也不会自己回来。

### 5. workflow 里显式校验 jar 内容

打包后检查 jar 里确实有 `BOOT-INF/classes/static/index.html`
和 `BOOT-INF/classes/db/migrations/*.sql`。

**为什么值得单独一步**：这两样任何一个缺失，jar 照样能打出来、部署照样"成功"，
表现分别是「网页一片空白但接口正常」和「启动报 missing table」——
两者的报错方向都指向别处，在生产上排查很贵。

## 被否决的方案

**① 构建镜像推 `hub.bja.sealos.run` 私有仓库。**
那个仓库是 Sealos DevBox「发布版本」功能在用的，凭据不直接暴露给用户，
GitHub Actions 推不上去。要走镜像路线得改用 `ghcr.io` + App Launchpad。

**② 在 DevBox 上跑 docker build。**
DevBox 是容器，里面通常没有 docker daemon；而且 2C/4G 构建会很慢。
构建放 Actions 的免费 runner 上更快也更干净。

**③ Docker `HEALTHCHECK` 指令。**
Kubernetes 完全忽略它，而 Sealos 底层就是 k8s。探针要配在 k8s 那侧。
留着只会给人「已经有健康检查了」的错觉。

**④ 运行时镜像里 `apt-get install curl tzdata`。**
第一次本地构建就栽在这 —— 代理返回 400，整条构建挂掉，
报错和应用毫无关系。而且两个包都不需要：
curl 只被那个被忽略的 HEALTHCHECK 用，JRE 自带 tzdb（`-Duser.timezone` 就够）。

## 顺带要修的既有缺陷

1. `application.yml` 的 `server.port` 写死 3001，容器里要 8080
2. 没有 graceful shutdown —— 滚动更新时在途请求直接断
3. `code-quality.yml` 的 `push` 只有 `dev`，直接推 main 一道闸门都不跑
4. `code-quality.yml` 跑 `npm test`，但 `package.json` 里没有 test 脚本
