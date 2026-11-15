# 需求 —— 公司名称在入驻时就收，别在提交订单时才拦（2026-11-15）

> 需求原话：「提交订单的时候提示 先补全公司名称 这个有问题 啥地方都没有补充的
>   而且在提交订单的时候补充 这个就很不合理」

## 现状（代码事实，逐条核实过）

| 事实 | 位置 |
|---|---|
| 邮箱验证码注册只建 `email` + 一个**空名字**的组织 | `IdentityService.registerVerifiedEmail` |
| 后端 `register()` 本来支持 `orgName`，但前端从未传 | `IdentityService.register` |
| 设置页**已有**「Company」卡片可填公司名 | `SettingsPage.tsx`（我用浏览器确认过） |
| 提交订单时才校验 `org.name`，且按钮照常可点 | `CustomerOrderService` 第 127 行 |

结论：不是"没有入口"，而是①注册不收 → 每个新客户都踩；②入口藏在设置里且报错不指路；
③按钮不预判，点了才报错。

## 调研

- 注册只收必要字段，但「账号主体」类信息（公司）属于 **required now**，不该拖到后面变成死胡同
- 缺资料时入口必须在用户找得到的地方，且被拦的那一刻就能补
- 来源：[LoginRadius · Progressive Profiling](https://www.loginradius.com/blog/identity/progressive-profiling)、
  [Signup form collects only essential fields](https://auditbuffet.com/patterns/ab-002353)

## 决定

1. 注册页加 **公司名称 \***（唯一新增字段，不加国家/地区）
2. 提交订单处：按钮禁用 + 说明 + 「补全」就地弹窗；保存后立即可提交
3. 设置页 Company 卡片保留（以后修改的入口）

## 验收

- 注册时公司名称必填
- 组织表里能查到注册填的公司名
- 公司名为空的老账号：提交按钮禁用、显示原因、点「补全」弹窗保存后按钮变可用
