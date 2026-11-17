# 变更记录 —— 部署文档对齐现行方式 + 镜像打入 commit

## 改动

| 文件 | 改了什么 |
|---|---|
| `Dockerfile` | 后端打包加 `ARG GIT_COMMIT=unknown` + `-Dgit.commit=${GIT_COMMIT}`；删掉不实的「测试由 CI 独立 job 跑」（仓库里没有这个 job）；DevBox 端口 / 内存说明改为 Sealos 应用 |
| `.github/workflows/image.yml` | `build-args: GIT_COMMIT=<7 位 sha>`；头部注释标明这是现行唯一链路、deploy.yml 已废弃；摘要的「下一步」改为重启 yuhao + 核对 ping |
| `backend/src/main/resources/application.yml` | 端口注释 DevBox → Sealos 应用（只改注释） |
| `deploy/README.md` | 重写：镜像 → Sealos 应用手动重启 → ping 核对；环境变量配在 Sealos 应用；保留建库 / Redis / 邮件 / 对象存储说明；回滚标「待确认」 |
| `README.md` | 仓库结构、「部署」一节、现状里的 DevBox 描述 |
| `.github/workflows/deploy.yml`、`deploy/devbox/*.sh` | 顶部加「已废弃」标注，内容不改；workflow 名改为 `[已废弃] Deploy to Sealos DevBox` |

## 验证

- 本地：`.githooks/pre-commit`；`mvn package -Dgit.commit=<sha>` 后 jar 内 build-info 带上该 commit
- 线上（待做）：本分支合进 main → Build Image 跑完 → Sealos 重启 yuhao → ping 的 `commit` 等于短 sha

## 遗留项（指出，不在本次范围）

- `SitePreviewConfig` 的官网目录默认值 `/home/devbox/app/site` 依赖已废弃的 `deploy-site.sh`，
  镜像里没有这个目录，容器里官网预览大概率不可用
- 回滚方式（把镜像改成 `:<sha>`）未验证
- GitHub 上 `DEVBOX_*` / `DB_PASSWORD` / `JWT_SECRET` 等 Secrets 已无读取方，是否删除由本人决定
- `deploy/README.md` 新写明：对象存储端点 / 桶名在 application.yml 无默认值，旧链路靠 deploy.yml 补；
  Sealos 应用里是否都配了，未核实（线上图纸功能目前是否正常未验证）
