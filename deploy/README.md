# 部署到 Sealos

> 目标形态：在 GitHub 上点一下 Actions，把 `main` 的最新代码部署到 Sealos DevBox。

```
GitHub (点 Actions → Run workflow)
   │
   ├─ npm run build        前端 → backend/src/main/resources/static/
   ├─ mvn package          打成单个 app.jar（前端在里面）
   ├─ 校验 jar 里确实有 static/index.html 和 db/migrations/*.sql
   │
   ├─ scp app.jar ──────────────────────▶ DevBox:/home/devbox/app/app.jar.new
   └─ ssh 'bash deploy.sh' ─────────────▶ 停旧 → 换 jar → 起新
                                             → 健康检查
                                             → 不过就自动回滚上一版
DevBox:8080 ──▶ https://mhswbrrnpspx.sealosbja.site
   │
   ├──▶ Sealos PostgreSQL（内网）
   └──▶ Sealos Redis（内网）
```

**★ 口令的唯一真源是 GitHub Secrets**（2026-09-07 起）。每次部署，workflow 把
`DB_PASSWORD` / `JWT_SECRET` / `REDIS_PASSWORD` / `STORAGE_S3_*` 覆盖进 DevBox 的
`/home/devbox/app/.env`（`deploy/devbox/apply-env.sh`）。DevBox 是容器，删了重建
或换一台，`.env` 就没了 —— 所以它只是缓存，不是真源。

> 之前（2026-08-02）的设计相反：GitHub 不碰任何数据口令，只有一把 SSH 私钥。
> 那样 GitHub token 泄露的爆炸半径更小，但 `.env` 没有任何备份。改掉的取舍见
> `changelog/2026-09-07_secrets-from-github/`。
>
> ★ GitHub Secrets **存进去就看不到了**（只能更新或删除），这是设计如此。
> 你自己要另留一份（密码管理器）。

---

## 第 1 步：在 Sealos 创建数据库

应用没有数据库起不来 —— `SchemaMigrationRunner` 在 JPA 初始化之前就要连库。

### ★ 为什么是独立实例，不和应用挤在 DevBox 里

| 理由 | 说明 |
|---|---|
| 生命周期不同 | 应用要频繁重新部署，数据库不能跟着重启 |
| DevBox 会被暂停 / 重建 | 它本质是开发环境，重建一次数据就没了 |
| 资源 | DevBox 只有 2C/4G，PG + Redis + JVM 挤一起互相抢 |
| 备份 / 监控 / 扩容 | 托管实例自带，自己跑容器全都没有 |

对本系统还有一条更硬的：`file_access_log`（图纸访问全审计）是
**跟欧洲客户签保密协议时的交付物**，客户会问「我的图纸泄露了你们能查到谁看过吗」。
它不能放在一个「重建就清空」的地方。

打开 Sealos 桌面 → **数据库**（Database）→ 新建：

### PostgreSQL

| 项 | 值 | 说明 |
|---|---|---|
| 类型 | **PostgreSQL 16** | 迁移用了 `inet`、`text[]`、部分索引、jsonb，14 以上都行，16 与本地一致 |
| 名称 | `yuhao-pg` | 随意，但要好认 |
| CPU / 内存 | 1 Core / 2 GiB | 起步够用 |
| 存储 | 10 GiB | 图纸走对象存储不进库，库本身长不快 |

创建后在实例详情里能看到**连接信息**，记下：
- 内网地址（形如 `yuhao-pg-postgresql.ns-aprx7mvw.svc`）和端口 `5432`
- 用户名、密码

然后**建业务库**（默认库通常是 `postgres`，那是维护库，别直接拿来放业务数据）。
在实例的终端里执行：

```sql
CREATE DATABASE mfg;
```

> **★ 这是唯一一次手工 SQL。建表、加列、加索引全部自动，见下面一节。**
>
> 只有这一步没法自动：JDBC 连的就是 `mfg` 库，它不存在就连不上，无法自举。
> 如果 Sealos 创建实例时允许指定初始库名，直接填 `mfg`，这一步也省了。

### 建表不用管 —— 迁移是自动的

`SchemaMigrationRunner` 在**每次应用启动时**扫 `database/migrations/`，
按文件名字典序应用所有还没跑过的文件，并按 `(文件名, 内容 SHA-256)` 记账。

所以加一张表的完整流程是：

```
写 database/migrations/2026-08-15_01_add-inspection-report.sql
  → git push
  → 点 Actions 部署
  → 应用启动时自动应用，日志里能看到 "applying migration: ..."
```

不需要连生产库、不需要跑任何 SQL。日志形态：

```
首次      applying migration: 2026-08-02_01_platform-core.sql
          ... applied 4 migration(s), 4 total on record
无新增时   schema up to date, 4 migration(s) on record
```

多实例并发启动由 `pg_advisory_lock` 保证只有一个在跑，其余排队后发现已应用直接放行。

### ★★ 但是：数据库改动不会随 jar 回滚

部署失败时 `deploy.sh` 会把 **jar** 回滚到上一版，
**但迁移已经执行了，schema 不会退回去**。结果是「旧代码 + 新 schema」。

加列这种向后兼容的改动无所谓；**删列 / 列改名 / 加 NOT NULL 会让回滚后的旧版本直接炸** ——
你以为回滚救回来了，其实服务还是挂的。

所以破坏性变更必须拆成两次发布（扩展-收缩）。
规则和判断方法写在 [`../CLAUDE.md`](../CLAUDE.md) §6「迁移必须向后兼容一个版本」，
**动 schema 之前先看那一节**。

> 另外：迁移在**端口打开之前**执行。大迁移会拉长启动时间，
> 超过 `deploy.sh` 的 `HEALTH_TIMEOUT`（默认 120 秒）会被误判成启动失败而触发回滚。
> 预计耗时长的迁移，部署前先把这个值调大。

### Redis

| 项 | 值 |
|---|---|
| 类型 | **Redis 7** |
| 名称 | `yuhao-redis` |
| CPU / 内存 | 0.5 Core / 1 GiB |

同样记下内网地址、端口 `6379`、密码。

> **★ Redis 不是可选的 —— 没有它部署会失败。**
>
> actuator 的 `RedisHealthIndicator` 会把 Redis 状态汇总进 `/actuator/health`，
> 而 `deploy.sh` 正是拿这个端点判断部署成不成功。实测：
>
> ```
> Redis 正常   /actuator/health  200  {"status":"UP"}
> Redis 停掉   /actuator/health  503  {"status":"DOWN"}
> ```
>
> 表现会非常迷惑：**应用其实起来了，业务接口也正常**
> （`/api/v1/public/ping` 照样 200），但健康检查不过 →
> 自动回滚 → Actions 报红。日志里看不到任何启动异常。
>
> 现在系统还没有真正用到 Redis（缓存不强制、定时任务还没写），
> 但它已经在健康检查链路里了。要么先建好，要么去掉 Redis 健康指示器 ——
> **不要选后者**：定时任务的分布式锁马上就要用它，
> 那时候 Redis 挂了必须让部署失败，而不是带着"锁失效"上线。

> **为什么必须用内网地址**：外网地址要过公网、有额外延迟和流量费，
> 而且把数据库暴露在公网上是没必要的风险。DevBox 和数据库在同一个
> namespace（`ns-aprx7mvw`）里，内网直连即可。

---

## 第 2 步：初始化 DevBox

从 DevBox 控制台拿到 SSH 信息（「SSH 配置」那一栏，点复制按钮拿完整命令；
「私钥」按钮下载私钥文件）。

```bash
# 在你本机
scp -i <私钥> -P <端口> deploy/devbox/bootstrap.sh devbox@<主机>:/tmp/
ssh -i <私钥> -p <端口> devbox@<主机> 'bash /tmp/bootstrap.sh'
```

`bootstrap.sh` 做三件事：

1. 装 `openjdk-21-jre-headless`（已有 21+ 就跳过）
2. 建 `/home/devbox/app/` 和 `.env` 模板
3. 装 `/home/devbox/project/entrypoint.sh` —— **DevBox 是容器不是虚拟机，
   通常没有 systemd**。没有这一步，DevBox 一被暂停/重启，应用就再也不会自己回来。

然后**编辑 `.env` 填地址类的值**（口令类不用填 —— 第 3 步配进 GitHub 后，
第一次部署会自动覆盖进来；地址类也可以配成 GitHub Variables 省掉这一步）：

```bash
ssh -i <私钥> -p <端口> devbox@<主机>
vi /home/devbox/app/.env
```

| 变量 | 填什么 |
|---|---|
| `SERVER_PORT` | `8080` —— DevBox 网络配置里对外暴露的就是它，别改 |
| `DB_URL` | `jdbc:postgresql://<pg内网地址>:5432/mfg` |
| `DB_USERNAME` / `DB_PASSWORD` | 第 1 步记下的 |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | 第 1 步记下的 |
| `JWT_SECRET` | `openssl rand -base64 48` 生成，**不要与本地开发共用** |
| `DEV_LOGIN_ENABLED` | **`false`** —— 见下面的红线 |

> ### ★★★ `DEV_LOGIN_ENABLED` 必须是 false
>
> `DevAuthController` 不校验任何凭据就能签出任意端的 token，包括 OPERATOR。
> 在生产打开它，等于把内部后台的完全访问权公开 —— 前面所有的端级隔离、
> 数据隔离六条铁律、白名单序列化全部作废，因为攻击者根本不需要越权，
> 他直接就是管理员。
>
> 真实登录做完的那个 PR 里，把 `DevAuthController` 和前端的 `devLogin` 一起删掉。

---

## 第 3 步：配置 GitHub Secrets

仓库 → Settings → Secrets and variables → Actions → New repository secret：

| Secret | 值 | 必填 |
|---|---|---|
| `DEVBOX_SSH_KEY` | DevBox 控制台下载的**私钥全文**（含 `-----BEGIN/END-----` 两行） | ✅ |
| `DEVBOX_HOST` | SSH 主机名 | ✅ |
| `DEVBOX_PORT` | SSH 端口 | ✅ |
| `DEVBOX_USER` | 通常是 `devbox` | ✅ |
| `DEVBOX_KNOWN_HOSTS` | `ssh-keyscan -p <端口> <主机>` 的输出 | 建议 |
| `DB_PASSWORD` | 第 1 步记下的（Sealos 数据库 → 连接信息里随时能看） | ✅ |
| `JWT_SECRET` | `openssl rand -base64 48` 生成，≥ 32 字节，**不与本地共用** | ✅ |
| `REDIS_PASSWORD` | 第 1 步记下的；Redis 没设口令就不用配 | 按需 |
| `STORAGE_S3_ACCESS_KEY` / `STORAGE_S3_SECRET_KEY` | Sealos 对象存储 → 桶 → 访问密钥 | 图纸域上线前 |

以上口令项每次部署都会覆盖进 DevBox 的 `.env`；**缺 `DB_PASSWORD` 或 `JWT_SECRET` 部署直接失败**，
不会等到应用起不来才发现。

非口令项走同一页的 **Variables** 标签（可选，没配就用 workflow 里的默认值或 DevBox `.env` 现有值）：
`DB_URL` / `DB_USERNAME` / `REDIS_HOST` / `REDIS_PORT` / `STORAGE_PROVIDER` /
`STORAGE_S3_ENDPOINT` / `STORAGE_S3_REGION` / `STORAGE_S3_BUCKET`。

> ★ 对象存储有两个端点：`STORAGE_S3_ENDPOINT` 填**内网**地址（服务端 put/get 走它，
> 不出集群）；再配一个 `STORAGE_S3_PUBLIC_ENDPOINT` 填**外网**地址 —— 给欧洲客户浏览器
> 用的图纸签名 URL 走它。不配 public 的话会回落到内网地址，客户点了打不开。

> `DEVBOX_KNOWN_HOSTS` 不填也能跑 —— workflow 会退化成每次现扫主机公钥，
> 并在日志里打出扫到的内容和一条 warning。现扫的问题是**无法防中间人**：
> 有人劫持了 DNS 或网络，你的私钥就直接送到对方手里了。
> 第一次部署成功后，把日志里打印的那几行存成这个 secret 即可固定。

---

## 第 4 步：部署

GitHub → **Actions** → 左侧 **Deploy to Sealos DevBox** → **Run workflow**
→ 分支选 `main` → 绿色按钮。

一次部署大约 3–6 分钟（首次久一些，Maven 要拉依赖）。

成功的日志尾部长这样：

```
[deploy 14:32:10] stopping pid 1234
[deploy 14:32:12] starting
[deploy 14:32:12] pid 5678
[deploy 14:32:39] healthy after 27s
[deploy 14:32:39] deploy OK
```

验证：

```bash
curl https://mhswbrrnpspx.sealosbja.site/actuator/health     # {"status":"UP"}
curl https://mhswbrrnpspx.sealosbja.site/api/v1/public/ping
```

浏览器打开 `https://mhswbrrnpspx.sealosbja.site` 应该看到登录页。

---

## 回滚

`deploy.sh` 自带自动回滚：新版本健康检查不过 → 自动换回上一版 → 重新起。
**无论回滚成功与否，Actions 都会显示红色** —— 回滚只是止血，不是部署成功。

手动回滚到上一版：

```bash
ssh -i <私钥> -p <端口> devbox@<主机>
cd /home/devbox/app
cp app.jar.prev app.jar.new && bash deploy.sh
```

---

## 排查

| 现象 | 多半是 |
|---|---|
| 部署卡在 `health check timed out` | 数据库连不上。`tail -100 /home/devbox/app/logs/app.log` 看真实异常 |
| `role "xxx" does not exist` | `DB_URL` 里的库名或用户名不对，或 `CREATE DATABASE mfg` 没执行 |
| 网页白屏、接口正常 | jar 里没有前端产物。workflow 的「确认 jar 里带上了前端」这步就是为此设的，它没拦住说明构建顺序被改过 |
| 启动报 `missing table` | 迁移没跑。检查 jar 里有没有 `BOOT-INF/classes/db/migrations/*.sql` |
| 启动报 `app.jar.secret is missing or too short` | `JWT_SECRET` 没填或不足 32 字节 |
| 公网地址 502 | 应用没起来，或 `SERVER_PORT` 不是 8080 |
| DevBox 重启后应用没了 | `entrypoint.sh` 没装上，重跑 `bootstrap.sh` |

看日志：

```bash
ssh -i <私钥> -p <端口> devbox@<主机> 'tail -f /home/devbox/app/logs/app.log'
```

---

## 已知限制

**DevBox 不是为生产设计的。**它可以被暂停、规格有限（2C/4G）、没有多副本、
没有滚动更新——部署期间会有几十秒不可用。

现阶段够用。等到需要**零停机**或**多副本**时，换成
「构建镜像 → 推 registry → Sealos 应用管理（App Launchpad）」：
仓库里的 `Dockerfile` 已经写好了，那条路只需要再加一个推镜像的 workflow。

**日志没有轮转。**`logs/app.log` 会一直长。上线跑起来后加个 logrotate，
或者把日志改成输出到 stdout 由平台收集。
