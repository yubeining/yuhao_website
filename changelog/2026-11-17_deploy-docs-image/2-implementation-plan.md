# 实施计划（动手前与本人对齐，2026-11-17 批准）

1. 镜像打入 commit：Dockerfile 加 `ARG GIT_COMMIT` 传给 `-Dgit.commit`，image.yml 传 `build-args`。
   ARG 放在 `mvn package` 前一行而不是阶段开头，避免每个 commit 让依赖缓存层失效。
2. 改正与事实不符的注释：Dockerfile（CI 测试 job、DevBox 端口/内存）、application.yml 端口注释、image.yml 头部和摘要。
3. 部署文档改为镜像 → Sealos 应用手动重启 → ping 核对；环境变量配在 Sealos 应用。
4. DevBox 相关文件保留，顶部标注废弃。

## 被否决 / 未采用

- 删除 `deploy.yml` 和 `deploy/devbox/`：本人选择保留并标注废弃
- 回滚步骤写成确定操作：未验证过，文档里标「待确认」
- 顺手修 `SitePreviewConfig` 的官网目录：属于代码行为变更，超出本次范围，只在遗留项里指出
