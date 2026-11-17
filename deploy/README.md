# 部署到 Sealos

> 现行方式（2026-11-17 起写进文档）：推 `main` → GitHub Actions 自动构建镜像推到 GHCR
> → 在 Sealos 应用管理里给应用 `yuhao` 点「重启」拉最新镜像。
>
> 原来的「Actions → Deploy to Sealos DevBox」链路**已废弃**。`.github/workflows/deploy.yml`
> 和 `deploy/devbox/` 下的脚本保留备查，不要再用；旧地址 `mhswbrrnpspx.sealosbja.site` 已无服务。

```
git push main
   │
   └─ .github/workflows/image.yml（push main 自动触发）
        ├─ docker build（Dockerfile 三阶段：前端 → 后端 jar → 运行时）
        │    └─ commit 短 sha 经 --build-arg GIT_COMMIT 打进 jar
        └─ 推送 ghcr.io/yubeining/yuhao_website:latest
                和 ghcr.io/yubeining/yuhao_website:<7 位 sha>

Sealos 应用管理 → yuhao → 「重启」（手动）
   └─ 拉 :latest 起新 Pod，端口 8080 ──▶ https://www.partcut.com
        │
        ├──▶ Sealos PostgreSQL（内网）
        ├──▶ Sealos Redis（内网）
        └──▶ Sealos 对象存储
```

**★ 推 main 不等于上线。**镜像构建完之后，线上仍跑着旧 Pod，直到有人在 Sealos 里点「重启」。

**★ 配置的真源是 Sealos 应用 `yuhao` 的环境变量**（应用管理 → yuhao → 变更 → 环境变量）。
GitHub Secrets 里那些 `DB_PASSWORD` / `JWT_SECRET` / `DEVBOX_*` 是旧 DevBox 链路用的，
现在不会被任何东西读到。

> ★ 环境变量自己另留一份（密码管理器）。应用删了重建，这些值就得重填。

---

## 第 1 步：在 Sealos 创建数据库

应用没有数据库起不来 —— `SchemaMigrationRunner` 在 JPA 初始化之前就要连库。

### ★ 为什么是独立实例，不和应用挤在一起

| 理由 | 说明 |
|---|---|
| 生命周期不同 | 应用要频繁重新部署，数据库不能跟着重启 |
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
  → git push main（自动出镜像）
  → Sealos 里重启 yuhao
  → 应用启动时自动应用，日志里能看到 "applying migration: ..."
```

不需要连生产库、不需要跑任何 SQL。日志形态：

```
首次      applying migration: 2026-08-02_01_platform-core.sql
          ... applied 4 migration(s), 4 total on record
无新增时   schema up to date, 4 migration(s) on record
```

多实例并发启动由 `pg_advisory_lock` 保证只有一个在跑，其余排队后发现已应用直接放行。

### ★★ 但是：数据库改动不会随镜像回滚

把应用换回旧镜像，**迁移已经执行了，schema 不会退回去**。结果是「旧代码 + 新 schema」。

加列这种向后兼容的改动无所谓；**删列 / 列改名 / 加 NOT NULL 会让回滚后的旧版本直接炸** ——
你以为回滚救回来了，其实服务还是挂的。

所以破坏性变更必须拆成两次发布（扩展-收缩）。
规则和判断方法写在 [`../CLAUDE.md`](../CLAUDE.md) §5「迁移必须向后兼容一个版本」，
**动 schema 之前先看那一节**。

> 另外：迁移在**端口打开之前**执行。大迁移会拉长启动时间。

### Redis

| 项 | 值 |
|---|---|
| 类型 | **Redis 7** |
| 名称 | `yuhao-redis` |
| CPU / 内存 | 0.5 Core / 1 GiB |

同样记下内网地址、端口 `6379`、密码。

> **★ Redis 不是可选的。**
>
> actuator 的 `RedisHealthIndicator` 会把 Redis 状态汇总进 `/actuator/health`：
>
> ```
> Redis 正常   /actuator/health  200  {"status":"UP"}
> Redis 停掉   /actuator/health  503  {"status":"DOWN"}
> ```
>
> 表现会非常迷惑：**应用其实起来了，业务接口也正常**
> （`/api/v1/public/ping` 照样 200），但健康端点是 503。
> 定时任务的分布式锁也依赖它（CLAUDE.md §8）。

> **为什么必须用内网地址**：外网地址要过公网、有额外延迟和流量费，
> 而且把数据库暴露在公网上是没必要的风险。应用和数据库在同一个
> namespace（`ns-aprx7mvw`）里，内网直连即可。

---

## 第 2 步：配置 Sealos 应用的环境变量

应用管理 → `yuhao` → **变更** → 环境变量。

| 变量 | 填什么 |
|---|---|
| `DB_URL` | `jdbc:postgresql://<pg内网地址>:5432/mfg` |
| `DB_USERNAME` / `DB_PASSWORD` | 第 1 步记下的 |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | 第 1 步记下的；Redis 没设口令就不填 `REDIS_PASSWORD` |
| `JWT_SECRET` | `openssl rand -base64 48` 生成，≥ 32 字节，**不要与本地开发共用**。不足 32 字节应用拒绝启动 |
| `STORAGE_S3_ENDPOINT` | 对象存储**内网**地址（见下） |
| `STORAGE_S3_PUBLIC_ENDPOINT` | 对象存储**外网**地址（见下） |
| `STORAGE_S3_BUCKET` | 桶名 |
| `STORAGE_S3_ACCESS_KEY` / `STORAGE_S3_SECRET_KEY` | Sealos 对象存储 → 桶 → 访问密钥 |
| `SEALOS_AI_API_KEY` | AI 报价用；不填时是 `not-configured` |
| `MAIL_HOST` / `MAIL_PORT` / `MAIL_USERNAME` | Resend：`smtp.resend.com` / `587` / `resend` |
| `MAIL_PASSWORD` | Resend 的 API key（`re_...`）。**不填就等于没接邮件** |
| `MAIL_FROM` | 发信地址，必须落在**已验证**的发信子域上（如 `noreply@mail.partcut.com`） |

`SERVER_PORT` 不用配 —— 镜像里已经 `ENV SERVER_PORT=8080`，和应用网络配置里暴露的端口一致。
其余变量的默认值见 `backend/src/main/resources/application.yml`。

> ★ **对象存储的端点和桶名在 `application.yml` 里没有默认值**（旧 DevBox 链路是在
> `deploy.yml` 里补的默认值），所以在 Sealos 应用里必须配。旧链路用过的值：
>
> | 变量 | 旧链路的值 | 谁在用 |
> |---|---|---|
> | `STORAGE_S3_ENDPOINT` | `http://object-storage.objectstorage-system.svc.cluster.local` | 服务端 put/get/head，不出集群 |
> | `STORAGE_S3_PUBLIC_ENDPOINT` | `https://objectstorageapi.bja.sealos.run` | 发给客户浏览器的签名 URL；也是 CSP 放行的域名 |
> | `STORAGE_S3_BUCKET` | `aprx7mvw-yuhao-oss` | |
>
> **public 配错或不配的后果**：签名对 host 敏感，用内网地址签出来的 URL，
> 客户的浏览器连域名都解析不了 —— 表现是图裂、下载不了，**后端日志一片干净**，
> 因为请求根本没到后端。启动日志里会有一条 warning 提示回落发生了；
> CSP 也会主动**不放行**内网域名（放了也没用，只会掩盖「外网地址没配」）。

> ### ★ 验证码能不能发出去，取决于 `MAIL_*` 这三件事
>
> 1. **发信域名在 Resend 里已 Verified**。只配 `MAIL_*` 不够 —— 域名没验证时，
>    用 Resend 的试用发件人只能发到账号自己的邮箱，发给真实客户会被拒。
> 2. **`MAIL_FROM` 用独立发信子域**（如 `mail.partcut.com`），不要用根域。子域要配
>    SPF / DKIM / DMARC，否则验证码大面积进垃圾箱 —— 而现象是"用户说没收到"，
>    后端日志里一切正常。
> 3. **没配 `MAIL_HOST` 时应用照常启动，但只把邮件打进日志前缀 `[email log-only]`**。
>    线上出现这一行就说明配置没生效，用户永远收不到验证码。
>
> 另外：Resend 免费档 **100 封/天**。验证码一登录一封，100 封约等于 100 次登录，
> 撞顶后发信会被拒。`app.auth.otp.daily-budget` 的默认值就是按这个额度定的。

---

## 第 3 步：部署

1. 代码合进 `main` 并推送。`image.yml` 自动跑（GitHub → Actions → **Build Image**），
   冷缓存 8–12 分钟，有缓存 2 分钟左右。等它变绿。
2. Sealos → 应用管理 → `yuhao` → **重启**。
3. 核对线上版本：

```bash
curl https://www.partcut.com/api/v1/public/ping
# {"code":200,"message":"ok","data":{..., "commit":"<7 位 sha>", "builtAt":"..."}}
```

`commit` 必须等于你推的那个提交的前 7 位（`git rev-parse --short=7 HEAD`）。
对不上就说明 Pod 没拉到新镜像，或者镜像还没构建完就点了重启。

> 2026-11-17 之前构建的镜像不带 commit，`commit` 一律是 `unknown`，只能用 `builtAt`
> 去对 Build Image 那次 run 的时间。

> ★ GHCR 上的 package 必须是 Public，否则 Sealos 拉镜像会 `ImagePullBackOff`
> （除非在应用里配 imagePullSecret）。

### 建运营账号

系统里没有建运营账号的入口（运营不自助注册）。在本机生成 SQL，看过之后贴到 Sealos 数据库 → 终端执行：

```bash
scripts/ops-user-sql.sh > /tmp/ops-user.sql   # 按提示输邮箱、显示名、组织名、密码
```

生成的 SQL 只有 INSERT；邮箱已存在就什么都不插。登录入口 `/auth/internal/signin`。

---

## 回滚

**待确认。**`image.yml` 每次都会额外推一个 `:<7 位 sha>` 标签，按理可以在应用「变更」里
把镜像从 `:latest` 改成某个旧 sha 来回滚 —— 但这是推导，没有实际操作验证过。
注意回滚不会撤销已执行的迁移（见第 1 步）。

---

## 排查

| 现象 | 多半是 |
|---|---|
| ping 的 `commit` 不是刚推的那个 | 没点重启；或 Build Image 还没跑完 / 跑失败了 |
| Pod 一直 `ImagePullBackOff` | GHCR package 不是 Public |
| `role "xxx" does not exist` | `DB_URL` 里的库名或用户名不对，或 `CREATE DATABASE mfg` 没执行 |
| 网页白屏、接口正常 | 镜像里没有前端产物，检查 Dockerfile 阶段 1 是否被改过 |
| 启动报 `missing table` | 迁移没跑。检查 jar 里有没有 `BOOT-INF/classes/db/migrations/*.sql` |
| 启动报 `app.jwt.secret is missing or too short` | `JWT_SECRET` 没填或不足 32 字节 |
| 公网地址 502 / 503 `no healthy upstream` | Pod 没起来或没就绪，看应用的「日志」 |

日志：Sealos 应用管理 → `yuhao` → **日志**。

---

## 多副本注意事项

扩缩容 = 在应用「变更」里改实例数。目前是 1 个实例。

| 项 | 状态 |
|---|---|
| 数据库迁移 | ✅ `pg_advisory_lock`，多副本同时启动只有一个执行迁移 |
| 认证 | ✅ 无状态 JWT，不需要会话粘连。⚠ **各副本 `JWT_SECRET` 必须一致**（配在应用环境变量里就自然一致） |
| 限流 / 幂等 / refresh token | ✅ 都在 Redis，天然共享 |
| 并发写 | ✅ 乐观锁在 DB |
| 文件 | ✅ 走对象存储，不落本地盘 |
| 定时任务 | ⚠ **`@Scheduled` 必须按 CLAUDE.md §8 加 Redis 锁**，否则 N 个副本重复跑 |
| 优雅停机 | ✅ `server.shutdown: graceful`，缩容时在途请求能收尾 |
| 日志 | ⚠ 各副本各写各的，没有聚合。副本一多要上日志收集 |
