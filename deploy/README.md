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

**★ GitHub 侧不保存任何数据库口令。**Actions 只有一把 SSH 私钥；
`DB_PASSWORD` / `JWT_SECRET` 只存在于 DevBox 上的 `/home/devbox/app/.env`。
这样 GitHub token 泄露不会连带泄露数据。

---

## 第 1 步：在 Sealos 创建数据库

应用没有数据库起不来 —— `SchemaMigrationRunner` 在 JPA 初始化之前就要连库。

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

然后**建业务库**（默认库通常是 `postgres`，别直接用）。在实例的终端里执行：

```sql
CREATE DATABASE mfg;
```

### Redis

| 项 | 值 |
|---|---|
| 类型 | **Redis 7** |
| 名称 | `yuhao-redis` |
| CPU / 内存 | 0.5 Core / 1 GiB |

同样记下内网地址、端口 `6379`、密码。

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

然后**编辑 `.env` 填真值**：

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
