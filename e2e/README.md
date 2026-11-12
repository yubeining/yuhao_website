# 主流程 E2E

用 **Playwright 驱动本机真实的 Chrome**，把「客户 → 运营 → 供应商」跑完一条真实订单。
不是 mock、不是接口单测：每一步都是真实渲染、真实点击、真实上传，失败时留截图。

## 它验的是什么

22 步，覆盖一条订单从下单到质检合格的完整生命周期：

```
客户   注册 → 登录 → 建订单 → 录零件 + 传图纸 → 提交
运营   登录 → 填报价（加成率/原价/币种/交期）→ 试算 → 发出报价
客户   确认报价（价格锁定）
运营   新建生产订单 → 分配零件 → 生成供应商邀请链接
供应商 凭邀请注册
运营   录折率 → 挂全市场派单 → 建合同
供应商 接单 → 签合同 → 开工 → 完工 → 发给平台
运营   质检（按件数：合格/返工/报废）
账号   账号管理页：新建外部用户 → 禁用 → 启用
```

断言都是断言**页面上的事实**（"已提交""已挂全市场""已全部合格"），不是"点到了按钮"。

## 前置

1. 起依赖：`docker compose up -d`（PostgreSQL + Redis）
2. 建一个专用库（不要用开发库 `mfg`，E2E 会往里造数据）：

   ```bash
   docker exec mfg-postgres-test psql -U mfg -d postgres -c "CREATE DATABASE mfg_e2e;"
   ```

3. 用 **memory 存储** 起后端（图纸上传走应用内的内存仓，不需要任何对象存储）：

   ```bash
   cd backend
   DB_URL=jdbc:postgresql://localhost:5443/mfg_e2e \
   REDIS_PORT=6380 \
   STORAGE_PROVIDER=memory \
   JWT_SECRET="local-dev-only-secret-please-change-me-0123456789abcdef" \
   mvn spring-boot:run
   ```

4. 造第一个运营账号（系统里没有这个入口）：

   ```bash
   bash e2e/seed-ops.sh
   ```

## 跑

```bash
cd e2e
npm install
npm run e2e
```

- 截图落在 `e2e/shots/`（已 gitignore）
- 失败时立刻停在那一步，并写 `report.json` 记下走到哪了
- 服务不在默认地址时用 `BASE_URL=http://host:port npm run e2e`

## 已知限制

- **只跑 happy path**。拒绝报价、返工、报废、定向派单、验证码登录都还没覆盖。
- **每次跑都造新数据**（用的是时间戳唯一邮箱/公司名），库会越来越大；要干净重来就重建 `mfg_e2e`。
- **依赖种子运营账号**。`seed-ops.sh` 直接写库 —— 这也说明「运营账号的创建入口」这个缺口还在。
- 应用里有几处 `window.confirm`（发报价、接单、禁用账号等），Playwright 默认会自动 dismiss，
  那会让这些操作静默失效；`lib.mjs` 里显式 `accept` 了，别删。
