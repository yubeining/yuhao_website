# 需求 —— 部署文档对齐现行方式 + 镜像打入 commit（2026-11-17）

> 需求原话：「看一下现在部署的是不是最新的」→「你顺便把代码中有问题 误导的修正一下」

## 背景

查线上版本时被仓库文档带偏：README / deploy/README / deploy.yml 都把
「Actions → Deploy to Sealos DevBox」当作部署方式，地址 `mhswbrrnpspx.sealosbja.site`
（现在返回 503 `no healthy upstream`）。实际线上是 Sealos 应用 `yuhao`，
镜像 `ghcr.io/yubeining/yuhao_website:latest`，域名 `www.partcut.com`。

另外线上 `/api/v1/public/ping` 的 `commit` 是 `unknown`：Dockerfile 打包时没传
`-Dgit.commit`，image.yml 也没传 commit 进去，线上版本只能靠 `builtAt` 去对时间。

## 已确认的事实（本人答复）

- DevBox 部署链路**已废弃**；相关文件**保留，标注废弃**，不删
- push main 出镜像后，上线方式是 **在 Sealos 应用里手动点重启**
- 应用环境变量**配在 Sealos 应用里**

## 验收

- 推 main 后，重启应用，ping 返回的 `commit` 等于该提交的 7 位短 sha
- 文档描述的部署流程与实际一致，不再指向旧 DevBox 地址
