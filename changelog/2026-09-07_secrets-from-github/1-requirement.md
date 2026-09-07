# 需求 —— 口令的真源从 DevBox `.env` 改为 GitHub Secrets

> 提出日期：2026-09-07 ｜ 提出人：项目负责人

## 原话

接入 Sealos 对象存储、要放 S3 的 key 时：

> 「我担心 DevBox 重启或者转移了 不就没有了？ 我建议是搞个 nacos」

对 GitHub Secrets 看不到值的疑问：

> 「我打开为什么发现 value 是没有的 是我没有配吗」

加完 5 个 secret 后：

> 「上面这几个 key 我都加好了 你都测试一下 行不行」

## 背景

2026-08-02 的部署设计：GitHub 只持有一把 SSH 私钥，`DB_PASSWORD` / `JWT_SECRET`
只存在于 DevBox 的 `/home/devbox/app/.env`，理由是缩小 GitHub token 泄露的爆炸半径。

问题：DevBox 是容器。暂停/重启不丢（持久卷），但删了重建、或换一台，`.env` 就没了，
而它没有任何备份，也没人能背出 `JWT_SECRET` 是什么。一个没人管的文件不配做唯一真源。

引出的第二个问题：`.env` 在哪、怎么进去看，对不常碰 DevBox 的人来说门槛太高
（本次就找了半天没找到 —— 本机 SSH 别名指向的是另一台已停止的 DevBox）。

## 验收

1. 口令类（`DB_PASSWORD` / `JWT_SECRET` / `REDIS_PASSWORD` / `STORAGE_S3_*`）的真源是 GitHub Secrets；
   每次部署覆盖进 DevBox `.env`，DevBox 删了重建后「跑 bootstrap + 点部署」即可恢复；
2. 没配的项不抹掉 DevBox 上已有的值（`JAVA_OPTS`、`HEALTH_TIMEOUT` 这些不在 GitHub 上）；
3. 口令不进命令行参数、不进 Actions 日志；
4. 缺 `DB_PASSWORD` / `JWT_SECRET` 时部署在 runner 上就失败，不等到应用起不来；
5. 口令填错时回滚必须连配置一起回滚，否则旧版也起不来；
6. 值里的 `$ " \` \` 不被 shell 求值破坏（`deploy.sh` 用 `. .env` 加载）；
7. Nacos 方案及否决理由记入实施计划。

## 关联

- `deploy/README.md`、`.github/workflows/deploy.yml`、`deploy/devbox/{apply-env,deploy,bootstrap}.sh`
- `docs/design/11` D21（Sealos OSS）
- 反转的既有决策：`changelog/2026-08-02_sealos-deploy/3-changelog.md`「GitHub 侧只有一把 SSH 私钥」
