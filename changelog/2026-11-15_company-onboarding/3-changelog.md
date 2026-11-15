# 变更记录 —— 公司名称入驻即收（2026-11-15）

## 后端

| 文件 | 改动 |
|---|---|
| `ExternalAuthController.RegisterByCodeRequest` | 新增 `orgName`（可选，≤200），老客户端不传仍可注册 |
| `IdentityService` | 新增 `registerVerifiedEmail(email, orgName)`，注册时写入组织名；旧方法委托为 `null` |

## 前端

| 文件 | 改动 |
|---|---|
| `RegisterPage` | 新增「公司名称 \*」+ 提示「会显示在报价单与合同上」，空值校验 |
| `services/auth.ts` | `registerWithCode` 增加 `orgName` |
| `components/CompanyNameModal.tsx` | 新增：单字段补全弹层（复用设置页同一个 PATCH 接口） |
| `OrderDetailPage` | 草稿时查组织名；为空则禁用提交、显示原因 + 「补全」按钮 |
| `styles.css` | `.cnm-*` 弹层样式 |
| `i18n` | 注册与订单页新增文案 |

## 关键点

- 公司名是**账号主体**（报价/合同抬头），属 required now，所以放在注册而不是下单时
- 补全弹层与设置页调同一个 `PATCH /customer/organization`，不新增接口
- 提交按钮从"点了才报错"改成"提前禁用 + 就地可补"

## 验证（真跑）

```
注册填「宁波测试机械有限公司」→ 提交按钮 disabled = false
DB 把 organization.name 置空 → 重新打开订单页：
  submit disabled = true
  hint = Complete your company name first
  点「补全」→ 填「宁波补全机械有限公司」→ 保存 → submit disabled = false
```

`mvn test` 90 通过；`type-check`、`build` 通过。

## 遗留

- 零件页在数据加载完成前（约 0.5s）填入的输入会被 `load()` 覆盖 —— 测试里踩到过，真实用户手速极快时也可能丢。待单独修
- 国家/地区、税号仍未收（等报价/开票需要时在设置里补）
- 公司名变更没有留痕，后续对账可能需要审计
