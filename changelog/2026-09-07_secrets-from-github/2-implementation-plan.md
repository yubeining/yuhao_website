# 实施计划 —— GitHub Secrets 覆盖进 DevBox `.env`

> 2026-09-07 ｜ 动手前对齐

## 必须做

1. `deploy.yml` 在「推送源码」之后、「构建」之前加一步「写入配置」：
   runner 上把 `secrets.*` / `vars.*` 收成 `KEY<TAB>base64(value)`，只带非空项，
   通过 ssh **stdin** 交给 DevBox 上的 `apply-env.sh`。缺 `DB_PASSWORD` / `JWT_SECRET`
   或 `JWT_SECRET` 不足 32 字节，在 runner 上直接失败。
2. 新增 `deploy/devbox/apply-env.sh`：备份 `.env` → `.env.prev`；逐 key 替换或追加；
   值加双引号并转义 `\ " $ \``；权限 600。
3. `deploy.sh`：部署成功删 `.env.prev`；回滚时若有 `.env.prev` 先还原再起旧 jar。
4. `bootstrap.sh` 的 `.env` 模板注释、`deploy/README.md`、`.env.example` 同步。

## 被否决的方案

| 方案 | 为什么不 |
|---|---|
| **Nacos**（提议） | 没解决问题只是挪了一层：应用还得从环境变量拿 Nacos 的地址和账号，Nacos 自己的数据还得落库 —— "它的库丢了怎么办"是同一个问题。规模也不匹配：Nacos 服务几十个微服务的动态配置，我们是一个 jar、十来个配置项、改配置本来就要重新部署。为此多养一个服务（本体 + MySQL + 口令 + 升级）维护面比问题大。CLAUDE.md §8「不引入新基础设施」 |
| Sealos App Launchpad + 控制台里配 Secret | 是更"正规"的形态（`Dockerfile` 已就绪，README 已知限制里提过），但要换掉整条部署链（DevBox 构建 → 推镜像），是另一件事；本次只解决口令真源 |
| 整份 `.env` 由 workflow 渲染（不合并） | 地址类的值也得全搬到 GitHub 才能跑，第一次迁移窗口大；且 `JAVA_OPTS` 这类 DevBox 特有的调优项放 GitHub 没道理。改成**只覆盖收到的 key** |
| 值走 ssh 命令行参数 | 进 ps、进 Actions 回显。改走 stdin + base64 |
| `sed -i "s/^KEY=.*/KEY=$val/"` 替换 | 值里的 `/ & \` 会把替换串搞乱。改用 awk + `ENVIRON`（`-v` 会把反斜杠当转义） |
| 把 `.env` 备份到密码管理器（人肉） | 治标；仍然是"有人记得才行"。作为补充手段推荐，不作为方案 |

## 风险

- **反转了 2026-08-02 的安全取舍**：GitHub token 泄露现在能带走数据库口令。
  接受的前提：仓库私有、Secrets 加密、日志自动打码；已向负责人说明。
- 第一次跑这条 workflow 时，GitHub 上的 `DB_PASSWORD` 必须和线上库一致，否则新版起不来 →
  回滚还原 `.env.prev` → 旧版照常。这正是要 `.env.prev` 的原因。
- `JWT_SECRET` 换新值：现有 token 全部失效。线上目前只有 dev-login 签的 token，零影响。

## 验证方式

- 本地：`apply-env.sh` 用临时目录跑一遍，值里塞 `$ " \` \\`，再 `. .env` 读回来比对。
- 线上：负责人点一次部署。「写入配置」步骤打印覆盖了哪些 key（不打印值）；
  健康检查通过 + 「核对线上版本」通过 = `DB_PASSWORD` 和 `JWT_SECRET` 都对
  （应用启动时校验 JWT 长度、连库）。
