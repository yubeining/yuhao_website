# 实施计划 —— 第 1 步：零件图纸 + 访问审计

> 2026-09-10 动手前经需求方批准。完整版见会话计划文件，这里只留结构和被否决的方案。

## 形状

三张表全归 `domain/order`（迁移 `2026-09-10_02`）：

- `part_revision`：挂 `part_design`，`rev_no` 我方编，唯一 `(part_design_id, rev_no)`
- `part_file`：挂版本，两段式上传状态 `PENDING → COMPLETED | REJECTED`
- `part_file_access_log`：bigserial 只增，每签发一次查看 URL 一行

`customer_org_id` 冗余到三张表，租户条件直接进查询（§3 铁律 2）。

接口全在 `/customer/**`：建零件 / 查零件 / 建版本 / 申请上传 / complete / 取查看 URL。
看图顺序「校验 → 签名 → 写审计 → 返回」：审计写不进去，URL 就不离开服务端。

## 被否决的方案

| 方案 | 为什么不用 |
|---|---|
| 图纸挂在订单行上 | D16：同一零件反复下单会堆出重复图纸，且答不了「这个零件改过几版」 |
| 用客户的 A/B/C 当版本号 | 文档 9 实样里约一半文件名没写版本字母，按文档 7「空即退回」会拒掉一半真实文件 |
| 上传经后端中转 | 需求方定了不卡大小，几百 MB 的 STEP 过应用有内存和超时风险；现有 multipart 注释也写明「用户上传走直传」 |
| 通用 `file_object` + `file_access_log` | 目前只有零件图纸一个用途（Simplicity First）；别的域要文件审计时再抽到 platform |
| 用 `AppProperties` 读存储配置 | ArchUnit `domainsDoNotDependOnWiring` 禁止 domain 依赖 `com.mfg.config`，改用 `@Value` |
| 本轮配桶 CORS | 本轮不接界面、没有浏览器上传，CORS 用不上；推到第 2 步，本轮不碰生产配置 |

## 顺序

迁移 → 本地应用 + psql 验约束 → 实体/Repository → ArchUnit → 类型校验（TDD）→
集成测试（TDD）→ service + controller → 文档 → `mvn verify` → 提交 → 部署 → 验。
