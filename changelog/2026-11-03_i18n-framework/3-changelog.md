# 变更记录 —— i18n 框架与文案抽取（2026-11-03）

## 验证

```
npx tsc -b --noEmit     通过
npm run build           通过（423 kB → 429 kB，gzip 130 → 132 kB）
python3 scripts/check-i18n-literals.py   通过
```

闸门自测：在 `pages/` 下新建一个含中文的 tsx → 检查失败；删除 → 通过。

## 一、框架

| 文件 | 作用 |
|---|---|
| `portal/src/i18n/lang.ts` | 语言判定唯一入口：手选 > 账号 locale > `navigator.languages` > `en` |
| `portal/src/i18n/I18nProvider.tsx` | `useI18n()` 提供 `t / lang / setLang / toggleLang` |
| `portal/src/main.tsx` | `I18nProvider` 挂在最外层（要读登录态） |
| `portal/src/mock/MockProvider.tsx` | 语言改为转手借用，页面 `useMock().t` 用法不变 |

## 二、规范文档

| 文件 | 内容 |
|---|---|
| `docs/i18n/README.md` | 三条硬规则（禁中文字面量、查术语表、英文以后端枚举为准）、key 命名、加文案流程 |
| `docs/i18n/glossary.md` | 约 60 条术语，分 7 个域，标依据；⚠ 表示待业务确认 |
| `docs/i18n/inventory.md` | 585 行文案的分批计划与逐文件状态 |

术语里定死的几条：`派单=dispatch`（不用 assignment）、`质检=QC`（不用 inspection）、
`发货=Ship`（供应商→平台）与 `交付=Deliver`（平台→客户）分开、`原价` 标 ⚠ 待确认。

## 三、防回退闸门

- `scripts/check-i18n-literals.py`：扫页面里的中文字面量，跳过注释；支持
  `i18n-exempt-start / -end` 块豁免（品牌名、语言名这类本就不该译的）
- `scripts/i18n-allowlist.txt`：未迁移文件清单，**只减不增**
- `.githooks/pre-commit`：加为第 8 道闸门

## 四、文案抽取进度

| 批次 | 行数 | 状态 |
|---|---|---|
| auth + components | 123 | ✅ |
| customer | 135 | ✅ |
| supplier | 89 | ✅ |
| SettingsPage / NotFoundPage / OnboardShell | 14 | ✅ |
| ops | 225 | ⏳ 未开始 |
| PortalProbe | 5 | ⏸ 不译（开发探针，不挂路由） |

白名单从 35 个文件减到 10 个。

## 五、过程中处理的三个结构问题

**1. 状态映射不能是模块级常量**

`status.ts` / `dispatchStatus.ts` 里的 `Record<状态, [tone, 文案]>` 在模块加载时就把中文定死了。
改成工厂函数 `orderSt(t)`；同时保留 `@deprecated` 兼容别名给还没迁移的 ops 页面，
保证**只有一份真相**，迁完删别名。

**2. 带参数的文案用函数，不用拼接**

`共 N 单` / `T+N 天` 这类，中英语序不同。全部改成 `(n) => ...`。

**3. 品牌名和语言名用块豁免**

`融一智造`、`中 / EN` 本来就不该翻译。加了 `i18n-exempt-start/-end` 标记，
而不是整文件加入白名单 —— 例外要局部、可解释。

## 六、补齐「跟账号走」与「邮件语言」

**接口**：`PATCH /customer/me/locale`、`PATCH /supplier/me/locale`（按端各一份，路径前缀即受众）。
只改自己 —— 用户 id 从 principal 取，请求体里没有身份字段。取值必须落在
`app.i18n.supported-locales` 里，否则 400，避免"存下来前端查空、整页变 key"。

**前端**：手动切换 → 本地 + 账号各写一份；登录时若本地手选过、和账号不一致，
以手选为准并推回账号（换设备也不丢）。

**邮件**：验证码邮件按「账号 locale > 浏览器 `Accept-Language` > 英文」选模板，
模板放 `backend/src/main/resources/i18n/otp-email-{zh,en}.txt`（首行主题、其余正文）。
不写进 Java 字面量 —— 文案要能交给翻译。

测试：`MeLocaleIT` 4 个用例（改自己的 / 非法取值被拒 / 客户 token 打不到供应商路径 / 匿名 401）。

## 遗留项

- **ops 最后 2 个文件**（`QuoteWorkPage`、`ProdPage`）在后续提交里已补齐
- **术语表里标 ⚠ 的条目**（原价等）需业务方确认
- **语言切换按钮只在登录页**：登录后放哪里未定
