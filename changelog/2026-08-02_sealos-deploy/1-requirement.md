# 需求 —— 一键部署到 Sealos

## 原话

> 是 sealos，写 Dockerfile 和部署配置 …… 这只是一个云服务托管的平台
> 所以我希望我的操作是，在 github 上点击 action 就可以把我 main 分支最新代码
> 部署到这个服务器上来

## 目标环境

Sealos **DevBox**（不是 App Launchpad 应用），从控制台截图读到：

| 项 | 值 |
|---|---|
| 名称 | `yuhao`，运行中 |
| 系统 | Ubuntu 24.04 |
| 规格 | 2 Core / 4 GiB |
| 私有镜像仓库 | `hub.bja.sealos.run/ns-aprx7mvw/yuhao` |
| 对外端口 | **8080** |
| 内网地址 | `http://yuhao.ns-aprx7mvw:8080` |
| 公网地址 | `https://mhswbrrnpspx.sealosbja.site` |

## 两个已确认的决策

**D-A：SSH 直推 DevBox**，不走「镜像 → registry → App Launchpad」。
DevBox 已经在跑、公网地址已经有了，不需要新建任何东西。
代价是没有滚动更新，部署期间几十秒不可用 —— 现阶段可接受。

**D-B：PostgreSQL 和 Redis 用 Sealos 托管数据库**，需要先手工创建。
应用没有数据库根本起不来（`SchemaMigrationRunner` 在 JPA 初始化前就要连库）。

## 验收

1. GitHub → Actions → Run workflow，能把 `main` 部署到 DevBox
2. 部署失败自动回滚到上一版，且 Actions 显示红色
3. GitHub 侧不保存任何数据库口令
4. 应用监听 8080（DevBox 暴露的端口），不是本地的 3001
5. DevBox 重启后应用能自己起来
6. Dockerfile 能在本地真实构建通过

## 不在本次范围

- 零停机 / 多副本（需要换 App Launchpad）
- 日志轮转与集中收集
- 预发环境
