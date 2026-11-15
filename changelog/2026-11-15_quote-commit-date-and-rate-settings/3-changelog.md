# 变更记录 —— 承诺交期 + 报价系数配置（2026-11-15）

## 数据

- 迁移 `2026-11-15_02_quote-commit-date.sql`：`quote.commit_date date`，历史行按 `sent_at + lead_days` 回填
- `lead_days` 继续写（由 commit_date 反推），下一版再删（扩展-收缩）
- `app_setting` 存全局默认报价系数（键 `quote.default-markup-rate`），**不写死默认值**：没配就报错，让运营去设置页填

## 后端

| 点 | 改动 |
|---|---|
| 报价 | `send(... LocalDate commitDate ...)`；承诺日期必须晚于今天；`lead_days` 由日期反推 |
| 视图 | 客户 / 运营报价视图的 `leadDays` → `commitDate` |
| 邮件 | 模板占位 `{days}` → `{date}`（中英两版） |
| 订单 | 提交时校验 `wanted_date` 必填（`order.wanted_date_required`） |
| 系数 | `effectiveMarkup` = 公司值 → 全局默认 → 报错；去掉「没设系数不能发」的单点阻断 |
| 接口 | 新增 `DELETE /ops/customers/{orgId}/markup`、`GET /ops/quote-settings`、`PUT /ops/quote-settings/default-markup`；`GET markup` 增加 `defaultRate` / `effectiveRate` |
| 配置 | `AppConfigService` + `AppSettingRepository`（原生 SQL 取 `jsonb::text`，绕开 Jackson 2/3 的 JsonNode 不兼容） |

## 前端

- 报价页：系数只读（`公司配置 ×1.15` / `全局默认 ×1.2` / `未设置`）；交期天数输入 → 承诺交期日期选择（预填客户期望交期）
- 新页 `ops/QuoteSettingsPage`：全局默认可编辑 + 公司列表只读（分页 20）；路由 `/ops/quote-settings`，侧边栏业务组
- 组织编辑抽屉：客户类型加「报价系数」（留空 = 用默认，显示当前默认）
- 客户订单详情：期望交期标必填，未填不能提交；三处展示改成日期

## 验证

```
mvn test 92 通过；mvn verify 151 通过（新增 1 个：全局默认兜底 + 公司值覆盖 + 清除回落）
type-check / build / i18n 闸门通过
浏览器（运营账号，本地）：
  报价设置：默认 1.25；公司行 = "用默认 / × 1.25"
  报价页：报价系数 × 1.25（全局默认）；承诺交期预填 2026-12-15
  组织编辑：报价系数 "留空 = 用全局默认 · 全局默认 × 1.25"
```

## 遗留

- `lead_days` 列的下线要等下一次发布（现在双写，回滚安全）
- 客户期望交期「必填」目前由 service 校验，列本身仍可空（历史数据不迁移）
