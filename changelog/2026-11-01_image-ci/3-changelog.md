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

- 备案与可用区是否真的冲突，**尚未验证**。文档说 bja（火山云）要求火山引擎备案，
  而本项目域名备案在阿里云。等第 4 步绑域名时实测定论 ——
  若确实不通，再决定迁 `hzh` 还是做接入备案
- `deploy/README.md` 第 316 行「DevBox 重启后应用没了 → `entrypoint.sh` 没装上，
  重跑 `bootstrap.sh`」是错的：文件装上了也不会被执行。待修
- `bootstrap.sh`「5. 容器重启后自动拉起」整段的注释同样基于这个错误假设。待修
- 本阶段没有回归验证 —— 仓库没有自动化测试入口能在本地跑（缺 JDK/Maven/Docker），
  构建正确性依赖 CI 首次运行的结果
