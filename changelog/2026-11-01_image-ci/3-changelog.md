# 变更记录 —— 阶段 1：镜像构建流水线（2026-11-01）

## 新增

`.github/workflows/image.yml`

- 触发：push 到 `main`，以及手动 `workflow_dispatch`
- 用仓库里现成的 `Dockerfile` 构建（context = 仓库根目录，三阶段构建原样复用）
- 推 `ghcr.io/yubeining/yuhao_website`，打两个 tag：`latest` 和 7 位短 commit
- 认证用 `secrets.GITHUB_TOKEN`，不需要新增任何 secret
- 缓存 `type=gha`，把 `npm ci` 和 `mvn dependency:go-offline` 两层留在 runner 缓存里
- `concurrency` 按 ref 分组、`cancel-in-progress: true`，连续推送只保留最新一次

## 为什么单独一个 workflow，而不是改 `deploy.yml`

`deploy.yml` 是「把源码同步到 DevBox、在 DevBox 上构建并直接跑」，
服务于开发/预发；它只保留 `workflow_dispatch`，刻意没有 push 触发。
本 workflow 产出的是**可部署的镜像**，两者职责不同，互不影响。

## 没有改的东西

- `Dockerfile` —— 原样复用，未做任何修改
- `deploy/` 下所有脚本 —— 未改
- `deploy.yml` —— 未改

## 部署清单

1. 合并后到 Actions 看 `Build Image` 是否变绿
2. **把 GHCR package 设为 Public**（Package settings → Danger Zone → Change visibility）
3. Sealos 应用管理新建应用：
   - 镜像 `ghcr.io/yubeining/yuhao_website:latest`
   - 端口 `8080`
   - 副本 `1`，内存 `4G`
4. **应用的环境变量要单独配**，不能依赖镜像里的 `.env`：
   `DB_URL` / `DB_USERNAME` / `DB_PASSWORD` / `REDIS_HOST` / `REDIS_PORT` /
   `REDIS_PASSWORD` / `JWT_SECRET` / `STORAGE_S3_ENDPOINT` / `STORAGE_S3_REGION` /
   `STORAGE_S3_BUCKET` / `STORAGE_S3_ACCESS_KEY` / `STORAGE_S3_SECRET_KEY`
5. 应用网络 → 自定义域名 → `www.partcut.com`

## 遗留项

- 备案与可用区是否真的冲突 —— **已验证：没有冲突**。`www.partcut.com` 绑定后
  返回 200，证书为 Let's Encrypt 的 `CN=www.partcut.com`。文档说的
  「阿里云备案 + 北京区无法访问」在实际环境里没有触发，原因未深究
- 裸域名 `partcut.com` 尚未绑定
- 迁移过程中数据库口令 / Redis 口令 / `JWT_SECRET` / S3 密钥曾明文出现，建议轮换
- 本阶段没有回归验证 —— 仓库没有自动化测试入口能在本地跑（缺 JDK/Maven/Docker），
  构建正确性依赖 CI 首次运行的结果

---

# 阶段 2：修正 `entrypoint.sh` 的错误描述（2026-11-01）

## 背景

阶段 1 排查时确认了一个错误假设：仓库原先认为
「`/home/devbox/project/entrypoint.sh` 是 Sealos DevBox 约定的启动入口，
装上去容器重启就会执行」。

实测两次（DevBox 重启后 `ss -lntp | grep 8080` 无输出、`ps -ef | grep java`
无进程、公网返回 `111`）证明：**DevBox 开发容器不执行这个文件**。
Sealos 文档的定义是「应用**在发布后**的启动方式，是**发布为 OCI 镜像时**的关键组件」。

## 改了哪里

只改注释/文档，**没有任何行为变化**：

| 文件 | 改动 |
|---|---|
| `deploy/README.md` | bootstrap 第 3 步的说明；文末故障排查表里「DevBox 重启后应用没了」那一行 |
| `deploy/devbox/bootstrap.sh` | 第 5 节的标题和注释 |
| `deploy/devbox/entrypoint.sh` | 文件头注释，去掉「DevBox 容器启动时执行」的错误说法 |

## 为什么值得单独记一笔

这个错误假设会把排查的人带偏：应用没起来时第一反应会是
「`entrypoint.sh` 没装上，重跑 bootstrap.sh」—— 而重跑一遍不会有任何变化，
因为问题不在安装，在于这个文件根本不被调用。

## 遗留项

- `deploy.yml`（DevBox 部署链路）暂时保留，作为备用；确认镜像链路稳定后再决定去留

