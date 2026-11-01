# 需求 —— 用镜像部署替换 DevBox 直跑（2026-11-01）

## 背景

线上站点 `www.partcut.com` 指向 `mhswbrrnpspx.sealosbja.site`，而后者是
**DevBox 的 8080 端口**。也就是说生产跑在开发容器里。由此产生三个具体问题：

### 1. DevBox 重启后应用不会自己回来

实测两次（2026-11-01 12:30 与 13:13）：点「重启」后等 2 分钟以上，
`ss -lntp | grep 8080` 无输出、`ps -ef | grep java` 无进程，公网地址返回
`delayed connect error: 111`（ECONNREFUSED）。必须手动重跑一次
`Deploy to Sealos DevBox` 才能恢复。

`deploy/devbox/bootstrap.sh` 与 `deploy/README.md` 原先的假设是
「`/home/devbox/project/entrypoint.sh` 是 Sealos DevBox 约定的启动入口，
装上去容器重启就会执行」。**这个假设不成立**：该文件确实被
`deploy/devbox/deploy.sh` 安装到了 `/home/devbox/project/entrypoint.sh`
（内容、权限都正确），但 DevBox 容器重启时并不执行它。

Sealos 官方文档对 `entrypoint.sh` 的定义是「定义了你的应用**在发布后**的启动方式，
是项目**发布为 OCI 镜像时**的关键组件」—— 它服务于发布出去的镜像，不服务于开发容器。

### 2. 「发布版本」在 bja 区反复失败

要想让 `entrypoint.sh` 真正生效、拿到副本管理和自动重启，正路是
「发布版本 → 部署应用」。但该功能在本 DevBox 上连续三次失败：

| 时间 | 操作 | 结果 |
|---|---|---|
| 13:0x | 运行中直接点「发版」 | DevBox 转「已停机」，版本历史仍为空 |
| 13:1x | 同上，重启后 | 版本历史被清空 |
| 14:0x | 先「暂停」→ 等「已停机」→ 硬刷新 → 发版 | 状态显示「关机中 / DevBox 当前发版中」，随后回到「已停机」，**版本历史仍为空** |

第一次失败时浏览器 Console 给出的报错是：

```
自动关机失败，发版必须在关机状态下进行，请重试
MISSING_MESSAGE: 自动关机失败，发版必须在关机状态下进行，请重试 (zh)
```

对应 Sealos 前端 `ReleaseDialog.tsx` 的逻辑（见 labring/sealos PR #6459）：
发版前若 DevBox 在运行则先 `shutdownDevbox`，然后**只轮询 2 分钟**等待
状态变成 `Stopped`，超时就抛上面这条错误并中止。`MISSING_MESSAGE` 说明
这条文案的中文语言包里都没有，属于很少被走到的路径。

后续两次即便绕过了关机检查（先手动停机），版本记录也没有生成，
且没有任何可见报错。这条链路不可控。

### 3. 域名绑不上

「变更 → 自定义域名 → `www.partcut.com`」校验 CNAME 的接口
`/api/platform/authCname` 返回 `{"code":200}`，说明 DNS 是对的
（实测 `www.partcut.com` CNAME → `mhswbrrnpspx.sealosbja.site` → `101.126.38.12`），
但保存后输入框被清空、域名不生效，`https://www.partcut.com` 至今仍是
`503 no healthy upstream`（响应与一个随机不存在的域名完全一致，说明该 Host
没有任何路由），443 端口也无证书（TLS 握手直接 RST）。

## 目标

1. `www.partcut.com` 能正常访问
2. 无论点 Action 还是重启，服务都能自己起来
3. 发版可用

## 验收标准

- `https://www.partcut.com` 返回 200，且证书正常
- 应用容器重启后，`/actuator/health` 在 2 分钟内自动恢复 200，无需人工介入
- push 代码后，一条流水线即可产出可部署的新版本

## 关联

无工单，`#0`。
