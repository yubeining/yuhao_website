# 机加工跨境定制平台

欧洲客户 → 我们 → 中国供应商，非标机加工定制的询价、报价、订单、生产、质检、发货全链路平台。

**工程规范见 [`CLAUDE.md`](./CLAUDE.md) —— 开工前必读。**
完整设计文档见 [`docs/design/`](./docs/design/)（业务理解 / 系统架构 / 领域模型 / 借鉴清单 / 路线图）。

> **当前状态：后端主链路已打通，前端 mock 层没拆完（截至 2026-11-02）。**
> 21 个迁移建 26 张表，端级隔离 / 认证 / 迁移 / 响应外壳已跑通；
> `domain/` 下已落地 order / quote / supplier 三个业务域，覆盖
> 客户下单 → 报价 → 派单 → 接单 → 合同 → 生产 / 质检 → 发货。
> 前端有 30 个文件仍依赖 mock 层，见文末「已完成 / 未完成」。

---

## 仓库结构

```
.
├── CLAUDE.md              ★ 工程规范（唯一真源，也是 AI 助手的上下文）
├── backend/               Spring Boot 4.1 / Java 25
│   └── src/main/resources/static/    ← portal 的构建产物落在这里（gitignored）
├── portal/                Vite + React 19 SPA —— 客户端 + 供应商端 + 内部后台
├── site/                  公司官网（静态演示稿，noindex，未对外部署）
├── database/
│   └── migrations/        手写迁移，开机自动应用
├── deploy/                部署到 Sealos 的配置与脚本
│   ├── README.md          ★ 部署指南：建库 → 初始化 DevBox → 配 Secrets → 点 Actions
│   └── devbox/            bootstrap.sh（一次性）+ deploy.sh（每次部署）
├── Dockerfile             前后端单一镜像（三阶段构建）
├── scripts/               提交闸门 + 运维脚本
├── .githooks/             commit-msg + pre-commit
└── changelog/             每个分支一个变更记录文件夹
```

### ★ 前后端是同一个部署单元

`portal` 打出来的静态产物直接进 `backend/src/main/resources/static/`，
由 Spring Boot 一并托管 —— **一个 jar、一个容器、一个端口**。

- 生产：浏览器请求 `/customer/rfqs` → `SpaForwardController` forward 到 `index.html` → React Router 接管
- 开发：vite dev server（:5173）用 proxy 把 `/api/v1` 转发到后端（:3001），保持同源

代价是前端构建必须在后端打包之前跑。收益是省掉一个容器、一套网关分流、一套 CORS 配置。

`site/`（官网）**不在这个部署单元里** —— 它是 SSG + 独立域名，为 SEO 服务，和交易平台的发版节奏无关。

---

## 快速开始

前置：**JDK 25**、**Maven 3.9+**、**Node 20+**、Docker。

```bash
# 1. 激活 git hooks（每个 clone / worktree 跑一次，git 不会自动带过来）
./scripts/setup-hooks.sh

# 2. 本地配置。★ 端口撞车时改这里，不要改 docker-compose.yml
cp .env.example .env

# 3. 起 PostgreSQL + Redis
docker compose up -d

# 4. 前端（产物落进后端 static/）
cd portal && npm install && npm run build

# 5. 后端（监听 3001）—— 脚本负责先加载 .env
./scripts/dev-backend.sh
```

打开 <http://localhost:3001>。

> **`.env` 不会被应用自动读取**（没有 dotenv 依赖）。`scripts/dev-backend.sh` 只做一件事：
> `set -a; . .env` 之后再 `mvn spring-boot:run`。
> 绕过它直接 `cd backend && mvn spring-boot:run`，`DB_URL` 会落到默认的 `5432` ——
> 那上面多半是本机 brew 的 postgres，报错是「库/角色不存在」，看着像迁移没跑。

首次启动时 `SchemaMigrationRunner` 会自动跑完 `database/migrations/` 下所有迁移。

### 前端热更新开发

```bash
cd portal && npm run dev      # :5173，API 自动 proxy 到 :3001
```

改前端时用这个，别每次 `npm run build`。后端仍然要开着。

### ★ 开发登录

**账号密码登录已做**（三个端，`POST /api/v1/auth/login`，`portalType` = CUSTOMER/SUPPLIER/OPERATOR）。
供应商暂时也走密码，手机验证码 / 企微扫码是后续。旧的 `DevAuthController` 后门已删除。

本地拿账号的三条路 —— 都是代码里真实存在的入口，没有种子开关：

- **客户端**：`POST /api/v1/auth/register` 自助注册，一次建「组织 + 首个用户」
- **供应商**：邀请制，不接受自助注册。运营发邀请后走
  `POST /api/v1/auth/supplier-invites/{token}/register`
- **运营**：**目前没有创建入口**。`ops_user` 表在，但没有任何播种或注册代码

> 登录已走真后端（`services/auth.ts`，旧的 `devLogin` 后门已删除）；
> 但部分页面的数据仍来自前端 mock 层，见文末「还没有」。

---

## 常用命令

| 目的 | 命令 |
|---|---|
| 后端单测 | `cd backend && mvn test` |
| 后端集成测试 | `cd backend && mvn verify` ← `mvn test` **不跑** `*IT.java` |
| 前端类型检查 | `cd portal && npm run type-check` |
| 前端构建 | `cd portal && npm run build` |
| 手动跑提交闸门 | `python3 scripts/check-committed-secrets.py` 等（需在 git 仓库内） |

> **跑 `mvn verify` 前**先 `docker compose up -d`，并把测试库 / Redis 指到 compose 的测试实例
> （默认值假设 5432 / 6379，本机常被别的 postgres 占着）。端口以 `docker compose ps`
> 实际映射为准，例如：
>
> ```bash
> TEST_DB_URL=jdbc:postgresql://localhost:5443/mfg_test \
> TEST_DB_USERNAME=mfg TEST_DB_PASSWORD=mfg TEST_REDIS_PORT=6380 \
> mvn verify
> ```
>
> 跳过的 5 项都是依赖外部服务的 IT（`AiServiceIT` / `EcbRatesClientLiveIT` /
> `S3StorageServiceIT`）。跳过不等于通过 —— 要验这几条得自己配 key 和桶。

冒烟验证：

```bash
curl localhost:3001/api/v1/public/ping     # {"code":200,"message":"ok",...}
curl localhost:3001/actuator/health        # {"status":"UP"}
```

---

## 部署

**完整步骤见 [`deploy/README.md`](./deploy/README.md)。**一句话版本：

> GitHub → Actions → **Deploy to Sealos DevBox** → Run workflow

它会构建前端、打成单个 jar（前端在 jar 里）、scp 到 Sealos DevBox、
健康检查不过自动回滚上一版。

**只有手动触发，没有 push 自动部署** —— 部署是决定，不是副作用。

首次部署前必须先做三件事（`deploy/README.md` 有详细步骤）：

1. 在 Sealos 建 PostgreSQL 16 + Redis，并 `CREATE DATABASE mfg`
2. 在 DevBox 上跑一次 `deploy/devbox/bootstrap.sh`，然后填 `/home/devbox/app/.env`
3. 在 GitHub 配 `DEVBOX_SSH_KEY` / `DEVBOX_HOST` / `DEVBOX_PORT` / `DEVBOX_USER`

> **★ 没有任何播种账号的开关。** 生产账号一律走真实入口创建（见上文「开发登录」），
> 不要写测试账号的初始化逻辑 —— 代码里也没有可以打开的后门。

本地也可以用 Docker 跑完整镜像：

```bash
docker build -t yuhao .
docker run -p 8080:8080 --env-file .env yuhao
```

---

## 三个端

| 端 | 路径前缀 | 受众 | 登录方式（规划） |
|---|---|---|---|
| 客户端 | `/customer/**` | 欧洲买方 | 邮箱 + 密码，自助注册后人工审核 |
| 供应商端 | `/supplier/**` | 中国供应商 | 手机号 + 验证码，邀请制开户 |
| 内部后台 | `/ops/**` | 我们 | 企微扫码 / 邮箱密码 |

端级隔离由后端 `PortalGuardInterceptor` 按路径前缀硬拒。
**前端 `PortalGuard` 只管跳转体验，不是安全边界。**

前后端用同一套路径前缀，所以看一眼 URL 就知道页面受众和它调的接口受众。

---

## 三条红线

1. **图纸访问全审计** —— 每次访问（含每次签发签名 URL）落 `file_access_log`
2. **供应商端 response 白名单序列化** —— 只允许显式列出的字段，默认不暴露
3. **一切锚定 `part_revision_id`** —— 绝不锚定"最新版本"

理由和细节见 `CLAUDE.md` §3。

---

## 提交规范

```
<Ticket>, <type>, <describe>

MFG-12, feat, [quote] add validity-period guard on customer quote acceptance
#0, fix, [sourcing] strip customer name from supplier package DTO
```

整条消息（含正文）**必须英文**。永远不用 `--no-verify`。

---

## 已完成 / 未完成

> 2026-11-02 本地实跑：`mvn test` 78 项、`mvn verify` 129 项，0 失败、5 跳过
> （跳过的 5 项依赖外部服务：AI key 2 项、ECB 实时行情 1 项、真实 S3 桶 2 项）。
> 前端 `npm run type-check` 与 `npm run build` 均通过。

**已跑通**

- 21 个迁移 → 26 张表（以 `database/schema.sql` 现值为准），开机自动应用、内容 hash 漂移检测
- 端级硬闸门：同一个 token 敲本端 200、敲他端 403 `common.wrong_portal`
- JWT 签发解析（principal id 用 `UUID` 不用 `String`，见 CLAUDE.md C6）、refresh token、三端账号密码登录
- `@CurrentUser` / `@CurrentParty` 参数解析器
- 统一响应外壳 + 全局异常处理（404 不再被兜底成 500）
- **业务域 3 个**，合计 88 个 HTTP 端点：
  - `domain/order`（59 个文件）—— 客户零件与图纸、订单草稿 / 提交 / 取消、多行明细与版本锚定；
    派单池、定向派单、挂单、撤回；合同签署与取消；供应商接单、逐件开工 / 完工、发货；
    按件质检与返工 / 重做
  - `domain/quote`（23 个文件）—— 汇率、客户加价、供应商价、报价预览与发送
  - `domain/supplier`（7 个文件）—— 供应商目录、产能与资质
- 平台层：S3 / memory 双存储、图纸访问审计落库（`part_file_access_log`）、
  邮件 / 企微通知、限流、幂等、汇率同步
- 定时任务 2 个（汇率同步、签字超时扫描），均按条目加 Redis 锁
- 测试：11 个 `*Test` + 19 个 `*IT`，共 207 项
- React SPA 三端骨架（32 个页面），由 Spring Boot 托管
- 部署：GHCR 镜像（推 `main` 自动构建）+ DevBox 部署（手动触发）；`www.partcut.com` 已在线

**还没有**

- **前端 mock 层没拆完**：30 个文件还依赖 `MockProvider`。其中约 9 个仍在读
  mock 内存数据（运营工作台 / 订单列表 / 汇率 / 账单 / 供应商资料 / 邮箱验证 / 账户壳），
  其余多数只是借它取 i18n 文案。该 Provider 同时兼着会话、i18n、主题和一个模拟
  AI 估价的定时器，删它之前得先拆成几个独立的 Provider
- **价格计算**：`docs/design/13-价格.md` 只定了四个价的字段含义，公式 / 币种 / 护栏仍【待确认】
- **账单、发票、付款、对客户发货**：后端无表、无端点
- **汇率写入**：只有 `GET /ops/fx-rates/latest`，没有运营改汇率的接口
- **邮箱验证**：无
- **图纸脱敏 / 水印**：未做（访问审计已落库）
- **供应商自助维护产能 / 资质**：只有 ops 侧 `PUT /ops/suppliers/{orgId}/capability`
- **官网 `site/`**：`noindex,nofollow` 的演示稿，未部署到 `www.partcut.com`
  （该域名现在跑的是平台 SPA）
- **零停机部署**：DevBox 单实例，部署期间有几十秒不可用
