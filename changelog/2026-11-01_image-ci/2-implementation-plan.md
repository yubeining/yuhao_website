# 实施方案 —— 用镜像部署替换 DevBox 直跑（2026-11-01）

## 目标架构

```
push main
   └─▶ GitHub Actions（本方案新增）
          └─▶ docker build（用仓库里现成的 Dockerfile）
                 └─▶ 推 ghcr.io/yubeining/yuhao_website:latest
                        └─▶ Sealos 应用管理：拉镜像 → N 个副本 → 绑 www.partcut.com
```

`Dockerfile` 不需要改 —— 它本来就是为这条路写的（三阶段：Vite 前端 → Maven 后端
→ JRE 运行时，非 root 运行，`SERVER_PORT=8080`，`JAVA_OPTS` 用 `MaxRAMPercentage`）。
`deploy/README.md` 的「扩缩容」一节也已经描述了这个方向。

## 分阶段

### 必须做

1. 新增 `.github/workflows/image.yml`：构建并推送镜像到 GHCR
2. 首次构建成功后，把 GHCR package 设为 **Public**（否则 Sealos 拉取会 ImagePullBackOff）
3. Sealos 应用管理新建应用：镜像用上面的地址，端口 8080
4. **环境变量配在应用上**（不是靠镜像里的 `.env`）：`DB_URL` / `DB_USERNAME` /
   `DB_PASSWORD` / `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` / `JWT_SECRET` /
   `STORAGE_S3_*`。理由见 `deploy/README.md`「环境变量一定要配在应用上」
5. 应用里绑 `www.partcut.com`

### 应该做

6. 验证通过后再补 `partcut.com`（裸域名）
7. 修正 `deploy/README.md` 与 `bootstrap.sh` 里关于 `entrypoint.sh` 的两处错误描述

### 可以延后

8. 保留 `deploy.yml`（DevBox 链路）作为开发/预发环境；确认镜像链路稳定后再决定去留
9. 日志聚合（目前各副本写本地文件）

## 会改的文件

| 文件 | 动作 |
|---|---|
| `.github/workflows/image.yml` | 新增 |
| `deploy/README.md` | 后续修正 `entrypoint.sh` 的描述 |

## 风险点

| 风险 | 说明 | 应对 |
|---|---|---|
| GHCR 镜像是私有的 | Sealos 拉不到，Pod 报 `ImagePullBackOff` | 首次构建后手动把 package 设为 Public |
| 备案与可用区不匹配 | 文档写「北京可用区（火山云）需在火山引擎备案，阿里云备案的域名无法正常访问」。本项目域名备案在阿里云，而集群是 bja（火山引擎） | 先按现状绑一次看实际行为；若确实不通，再评估迁 `hzh`（阿里云）或做接入备案 |
| 应用与数据库同区 | Postgres / Redis / 对象存储都在 bja。若为绕备案迁到 hzh，这三个也要一起迁 | 迁移成本高，因此优先在 bja 验证 |
| 首次构建慢 | npm ci + Maven go-offline 冷启动约 8~12 分钟 | workflow 超时给 40 分钟；用 GHA 缓存层加速后续构建 |

## 被否决的方案

### 继续用 DevBox 的「发布版本」

**否决理由**：已验证三次失败，且失败时不给任何可见错误。第一次的报错来自
一个 2 分钟的硬编码超时（前端源码 `timeout = 2 * 60 * 1000`），
本地无法调整；后续两次连错误都没有。继续试的期望收益低于成本。

### 在 DevBox 前面挂一个 nginx 反向代理应用

**否决理由**：能绕开域名绑定问题，但不在需求方接受的范围内；
且它只解决第 1 个目标，第 2、3 个目标（重启自愈、发版）依旧无解。

### 在 GitHub Actions 里构建 jar 再 scp 到 DevBox

**否决理由**：`deploy.yml` 的注释里已经记录过实测结论 —— 跨境链路 8 KB/s，
130 MB 的 fat jar 要 4 小时，而 workflow 超时 25 分钟。镜像推送走 GHCR，
不受这条链路限制。

### 把镜像推到 Sealos 自带的 `hub.bja.sealos.run`

**否决理由**：该地址解析到 `172.16.0.11 / 172.16.0.12`，是集群内网地址，
GitHub runner 在公网推不进去。这也是为什么 `deploy/README.md` 里说
「发版时自动推送，不需要你配任何凭证」—— 只有 DevBox 自己能推到那儿。
