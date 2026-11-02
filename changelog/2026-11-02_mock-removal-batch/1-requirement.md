# 需求 —— 清理前端 mock 层与过期文档（2026-11-02）

## 背景

这个仓库是从远端重新 clone 到本地工作区的（原先本机并没有 clone）。接手第一件事是核对
「README 说的现状」和「代码的真实现状」，结果两边对不上：

- README 写着「业务功能为 0」「`domain/` 下 13 个业务包全空」，而 `domain/` 下
  `order` / `quote` / `supplier` 三个包已经写完，最后一次提交是 2026-09-20
- README / `.env.example` / `deploy/` 里教人用 `DEV_SEED_ENABLED=true` 播三个测试账号，
  但后端 Java 源码里 `seed` 零匹配 —— 这个开关**不存在**
- `deploy/` 里同类的还有一个 `DEV_LOGIN_ENABLED`，同样零匹配
- 前端有 30 个文件还依赖 `mock/MockProvider`，其中约 10 个仍在读 mock 内存数据

## 需求原话（按时间顺序）

1. 「看一下这个项目 本地应该是有了 但是更新最新远程到本地 然后看一下项目现状」
2. 「装 JDK 25（或配 maven toolchain），把 mvn test / mvn verify 真跑一遍；
   把 README 的状态章节按实际代码更新一遍；列出还没接真后端的 mock 页面清单，逐个评估改造成本」
3. 「能做的先做」—— 工作台里 3 个有真实来源的指标
4. 「页面肯定不能是伪造的」—— 对 `ops/RatesPage` 的处理原则

## 验收

- `mvn test` / `mvn verify` 在本机 JDK 25 上真跑通，跳过项有明确原因
- README 的现状描述与代码一致，过期说法清干净（含两个不存在的开关）
- mock 页面逐页给出结论：改 / 删 / 待确认，并说明依据
- 删除的页面在构建产物里零残留，路由与导航同步清掉
