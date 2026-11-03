# 多语言（i18n）规范

> 这份文档是**唯一规范**。以后加任何面向用户的文案，都按这里来。
> 违反的表现不是报错，而是「页面里又冒出一句写死的中文」，几周后没人说得清哪些翻过、哪些没翻。

---

## 1. 三条硬规则

### ① 页面里不许出现中文字面量

```tsx
// ✗ 禁止
<h1>我的订单</h1>
<Empty text="还没有订单" />

// ✓ 正确
<h1>{t.order.title}</h1>
<Empty text={t.order.empty} />
```

**唯一例外**：注释可以写中文（那是给读代码的人看的，不上屏）。

### ② 英文术语必须查 [`glossary.md`](./glossary.md)

不许自己拍。同一个概念在 A 页面叫 `dispatch`、B 页面叫 `assignment`，用户会以为是两个功能。

### ③ 英文以后端枚举/字段名为准

后端已经有 `ASSEMBLING` / `OFFERED` / `SHIPPED` / `rework` / `remake` / `discountRate` / `markupRate`，
前端就沿用同一批词。**同一个业务概念，前后端只允许有一个英文名** —— 否则排查问题时两边对不上。

---

## 2. key 怎么命名

```
t.<域>.<对象>.<字段>
```

| 例 | 说明 |
|---|---|
| `t.order.title` | 域=order，对象=title |
| `t.quote.status.open` | 状态类统一放 `.status.<枚举值小写>` |
| `t.common.save` | 跨页面复用的放 `common` |
| `t.errors.auth.otp_expired` | 后端 i18n code 原样作 key，不做二次映射 |

**禁止**：
- 用位置命名（`t.leftButton`）—— 布局一改 key 就撒谎
- 用序号（`t.item1`、`t.text2`）
- 一个 key 装两种含义

---

## 3. 代码结构

```
portal/src/i18n/
├── lang.ts            ★ 语言判定（手动 > 账号 > 浏览器 > en），唯一入口
├── I18nProvider.tsx   ★ React 出口，useI18n() 拿 t / lang / setLang
├── strings.ts         文案字典（zh / en 两份，结构必须完全一致）
└── errorText.ts       后端错误码 → 文案
```

页面里只用 `useI18n()`。**不要在页面里读 `navigator`、`localStorage` 或 `document.documentElement.lang`。**

### 语言优先级（已实现）

| 顺序 | 来源 | 何时生效 |
|---|---|---|
| 1 | 用户手动切换 | 一旦点过，永远优先 |
| 2 | 账号 `locale` | 登录后，且没手动切过 |
| 3 | `navigator.languages` | 首次访问、未登录 |
| 4 | `en` | 兜底 |

**探测结果不落盘**，只有手动切换才写 `localStorage['mfg.lang.user']`。
原因：如果混存，用户手动选的中文会被另一台英文设备的探测结果覆盖。

**不做 IP 地理位置** —— VPN、出差、跨国办公都会猜错，且欧盟客户对 IP 定位有额外说明义务。

---

## 4. 加一条新文案的流程

1. 在 `strings.ts` 的 `zh` 和 `en` **两份**里同时加 key（只加一份，TS 会报错）
2. 英文去 `glossary.md` 查；查不到 → 先在 glossary 里补一行，再写代码
3. 页面里用 `t.xxx`
4. 跑 `python3 scripts/check-i18n-literals.py`

---

## 5. 防回退

```bash
python3 scripts/check-i18n-literals.py          # 检查
python3 scripts/check-i18n-literals.py --init   # 把当前未迁移的文件写进白名单
```

白名单在 `scripts/i18n-allowlist.txt`，列的是**还没迁移**的文件。
每迁移完一个文件，就从白名单里删一行 —— **白名单只减不增**。
新文件如果写了中文且不在白名单里，检查直接失败。

> 这是刻意选的棘轮策略：存量先放过，增量一律拦。否则一次全量迁移做不完，闸门就永远不会开。

---

## 6. 迁移进度

见 [`inventory.md`](./inventory.md)：585 行文案，按端分批，抽一条划一条。

---

## 7. 还没做的（别当成已完成）

- 登录之后没有语言切换入口（放顶栏还是设置页未定）
- 后端接口 `PATCH /{portal}/me/locale` 未实现 —— 手动切换目前只存本地，不跟账号走
- 邮件/通知语言未按 locale 渲染（验证码邮件写死英文）
- 只有中英两种语言；是否加德/法语未定
