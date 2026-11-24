# 实施计划（已批准）

顺序：颜色变量 → 外壳 → 组件样式 → 登录 / 入驻页（只随变量变化） → 客户订单详情布局 → 注释与记录。

| 文件 | 改动 |
|---|---|
| `portal/src/styles.css` | 重写 token（暖灰底、石墨 deep、圆角 3/4/6/8、去卡片阴影、IBM Plex 字体栈）；外壳段改成侧栏版；区块标题 / 表头 / 字段标签改小号大写（表头、标签用等宽）；按钮、状态标签收小圆角；头注释改为「本文件即真源」 |
| `portal/src/components/AppShell.tsx` | 删 GlobalNav（顶栏）；SideNav 顶部放品牌 + 端标识或大区切换，底部放设置 + 用户菜单；侧栏总是渲染；提示条移进主区 |
| `portal/src/pages/customer/OrderDetailPage.tsx` | 零件表在最上，订单信息与收货地址在下方左右两栏（`.cols`） |
| `portal/src/main.tsx` + `package.json` | 引入 `@fontsource/ibm-plex-sans` / `ibm-plex-mono` 5.3.0 的 latin 子集 |

## 被否决的方案
- **方向 A（纯净 / Linear）**、**方向 B（明亮专业 / Stripe）**：需求方选了 C。
- **Google Fonts 外链**：后端 CSP 为 `font-src 'self'`，会被拦；改为打包。
- **C 方向原示意里的橙色主色**：需求方要求保留品牌蓝。
- **窄屏顶部横条**：第一版上线后需求方否决（手机上也必须是侧栏），改抽屉。
- **窄屏沿用 56px 图标栏**：大区切换是文字、没有图标，收不进图标栏，供应商手机上会切不了大区；改成窄屏时侧栏变顶部横条。

## 验证方式
- `cd portal && npm run build`（含 `tsc -b`）
- 本地测试客户账号：订单列表 / 订单详情，浅色 + 深色 + 390px 窄屏 + 用户菜单展开截图
