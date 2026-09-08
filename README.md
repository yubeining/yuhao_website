# 机加工跨境定制平台

欧洲客户 → 我们 → 中国供应商，非标机加工定制的询价、报价、订单、生产、质检、发货全链路平台。

**工程规范见 [`CLAUDE.md`](./CLAUDE.md) —— 开工前必读。**
完整设计文档见 [`docs/design/`](./docs/design/)（业务理解 / 系统架构 / 领域模型 / 借鉴清单 / 路线图）。

> **当前状态：骨架可运行，业务功能为 0。**
> 数据库 31 张表已建好，端级隔离 / 认证 / 迁移 / 响应外壳这些地基已跑通，
> 但 `backend/.../domain/` 下 13 个业务包全是空的。见文末「已完成 / 未完成」。

---

## 仓库结构

```
.
├── CLAUDE.md              ★ 工程规范（唯一真源，也是 AI 助手的上下文）
├── backend/               Spring Boot 3.5 / Java 21
│   └── src/main/resources/static/    ← portal 的构建产物落在这里（gitignored）
├── portal/                Vite + React 19 SPA —— 客户端 + 供应商端 + 内部后台
├── site/                  公司官网（SSG，独立部署，尚未开始）
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

前置：**JDK 21**、**Maven 3.9+**、**Node 20+**、Docker。

```bash
# 1. 激活 git hooks（每个 clone / worktree 跑一次，git 不会自动带过来）
./scripts/setup-hooks.sh

# 2. 本地配置。★ 端口撞车时改这里，不要改 docker-compose.yml
cp .env.example .env

# 3. 起 PostgreSQL + Redis
docker compose up -d

# 4. 前端（产物落进后端 static/）
cd portal && npm install && npm run build

# 5. 后端（监听 3001）—— 环境变量见 .env
cd backend && mvn spring-boot:run
```

打开 <http://localhost:3001>。

首次启动时 `SchemaMigrationRunner` 会自动跑完 `database/migrations/` 下所有迁移。

### 前端热更新开发

```bash
cd portal && npm run dev      # :5173，API 自动 proxy 到 :3001
```

改前端时用这个，别每次 `npm run build`。后端仍然要开着。

### ★ 开发登录

**账号密码登录已做**（三个端，`POST /api/v1/auth/login`，`portalType` = CUSTOMER/SUPPLIER/OPERATOR）。
供应商暂时也走密码，手机验证码 / 企微扫码是后续。旧的 `DevAuthController` 后门已删除。

本地开发打开种子账号（默认关闭），启动时自动建三个测试号：

```bash
DEV_SEED_ENABLED=true mvn spring-boot:run
```

| 端 | 账号 | 密码 |
|---|---|---|
| 内部后台 | `ops@mfg.local`（portalType `OPERATOR`） | `dev12345` |
| 客户端 | `customer@mfg.local`（`CUSTOMER`） | `dev12345` |
| 供应商端 | `supplier@mfg.local`（`SUPPLIER`） | `dev12345` |

> **★ 生产 `.env` 里 `DEV_SEED_ENABLED` 必须是 `false`。**生产的运营管理员另配。
> 前端的 `services/auth.ts#devLogin` 还没清（前端仍跑在 mock 上），接真后端时一起改。

---

## 常用命令

| 目的 | 命令 |
|---|---|
| 后端单测 | `cd backend && mvn test` |
| 后端集成测试 | `cd backend && mvn verify` ← `mvn test` **不跑** `*IT.java` |
| 前端类型检查 | `cd portal && npm run type-check` |
| 前端构建 | `cd portal && npm run build` |
| 手动跑提交闸门 | `python3 scripts/check-committed-secrets.py` 等（需在 git 仓库内） |

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

> **★ `.env` 里的 `DEV_SEED_ENABLED` 必须是 `false`。**
> 它会播种带已知弱口令的测试账号，生产打开等于放三个公开后门账号。

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

**已跑通**

- 6 个迁移 → 31 张表 + ops_user + 1 视图 + 1 触发器（拆单不变式），开机自动应用、内容 hash 漂移检测
- 端级硬闸门：同一个 token 敲本端 200、敲他端 403 `common.wrong_portal`
- JWT 签发解析（principal id 用 `UUID` 不用 `String`，见 CLAUDE.md C6）
- `@CurrentUser` / `@CurrentParty` 参数解析器
- 统一响应外壳 + 全局异常处理（404 不再被兜底成 500）
- ops 端路由权限表 + `access_grant` 查询
- React SPA 三端骨架，由 Spring Boot 托管

**还没有**

- `domain/` 下 13 个业务包全空 —— RFQ、报价、订单、生产、质检、发货一个都没实现
- 真实登录：账号密码（三端）+ refresh token **已做**；供应商手机验证码 / 内部企微扫码 **待做**
- 对象存储服务已接（S3/Sealos OSS，见 `platform/storage`）；图纸脱敏 / 水印、`file_access_log` 落库 **待做**
- 定时任务（报价过期扫描、汇率同步…）—— 每一个都要按条目加 Redis 锁
- 平台层已有单测 + IT（鉴权 / 存储 / 限流 / 通知 / 登录）；业务域测试随域一起写
- `site/` 官网
- 零停机部署。DevBox 单实例，部署期间有几十秒不可用
