# 变更记录 —— GitHub Secrets 覆盖进 DevBox `.env`

> 2026-09-07 ｜ 部署链变更 ｜ 无 schema、无应用代码

## 破坏性变更（部署流程）

**口令真源从 DevBox `.env` 改为 GitHub Secrets。** 反转 2026-08-02 的设计。
第一次跑新 workflow 前，GitHub 上必须已有 `DB_PASSWORD` / `JWT_SECRET`
（负责人 2026-09-07 已加：`DB_PASSWORD` / `JWT_SECRET` / `REDIS_PASSWORD` /
`STORAGE_S3_ACCESS_KEY` / `STORAGE_S3_SECRET_KEY`）。

## 改了什么

- `.github/workflows/deploy.yml`：新增「写入配置」一步（推送源码之后、构建之前）。
  runner 侧校验必填项与 `JWT_SECRET` 长度；非空项 base64 后经 ssh stdin 交给 DevBox。
  非口令项走 `vars.*`，缺省值：`STORAGE_PROVIDER=s3`、Sealos 内网 S3 端点、`us-east-1`、桶 `aprx7mvw-yuhao-oss`。
- `deploy/devbox/apply-env.sh` **新增**：备份 `.env.prev`、逐 key 替换/追加、转义、600。
- `deploy/devbox/deploy.sh`：成功删 `.env.prev`；回滚先还原 `.env.prev` 再起旧 jar。头部注释更新。
- `deploy/devbox/bootstrap.sh`：`.env` 模板头注释改为"口令由部署覆盖，占位符不用手填"。
- `deploy/README.md`：真源说明、第 2 步、第 3 步 Secrets 表（新增 4 行 + Variables 段）。
- `.env.example`：加 `STORAGE_S3_*` 五项（secret 留空）。

## 验证

本地 dry-run（临时目录，值里含 `$ " \` \\`）：

```
[apply-env] 3 key(s) written to .../.env (previous copy kept as .env.prev)
DB_PASSWORD="p@ss\$w0rd\"with\`quotes\\\\"
JWT_SECRET="40XG...oh1"
JAVA_OPTS="-XX:MaxRAMPercentage=50 -Duser.timezone=Asia/Shanghai"   ← 未被抹掉
STORAGE_S3_BUCKET="aprx7mvw-yuhao-oss"                              ← 追加
. .env 读回 DB_PASSWORD == 输入值 ✓
```

线上验证：**待负责人点一次部署**。看「写入配置」步骤输出的 key 列表、健康检查、「核对线上版本」。
结果补记在下方。

### 线上结果

（待填）

## 部署清单

1. 合到 `main`；
2. GitHub → Actions → Deploy to Sealos DevBox → Run workflow（`main`）；
3. 看日志「写入配置」一步：应打印 `覆盖 N 项：DB_PASSWORD JWT_SECRET ...`，无值；
4. 健康检查通过即口令正确。失败会自动回滚 jar **和** `.env`。

## 遗留项

| # | 事项 |
|---|---|
| 1 | `JWT_SECRET` 已换新值：现有 token 全部失效（当前只有 dev-login，无影响） |
| 2 | 负责人另留一份口令（密码管理器）—— GitHub Secrets 存进去就读不回来 |
| 3 | `STORAGE_S3_*` 现在只是写进 `.env`，应用还没读它（图纸域上线时接） |
| 4 | 本机 `~/.ssh/sealos/devbox_config` 指向的 DevBox（`ns-z74yy1j7`）不是线上那台，且已停止；如无用可删 |
