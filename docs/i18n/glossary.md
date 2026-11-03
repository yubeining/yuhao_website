# 术语表（Glossary）

> **英文以此为准，不许自己拍。** 页面里出现一个新概念，先来这张表查；表里没有就先补一行再写代码。
>
> 依据优先级：**① 后端已有枚举/字段名 > ② 机加工外贸行业惯用词 > ③ 我的判断（标 ⚠ 的需业务方确认）**

---

## 一、订单与状态

| 中文 | 英文 | 依据 |
|---|---|---|
| 客户订单 | Customer order | 后端 `CustomerOrder` |
| 生产订单 | Production order | 后端 `OpsOrder`（内部叫 ops order，对内外都叫 production order） |
| 供应商订单 | Supplier order | 后端 `SupplierOrder` |
| 订单行 / 明细行 | Line / Line item | 后端 `OrderLine` |
| 草稿 | Draft | `CustomerOrder.Status.DRAFT` |
| 已提交 | Submitted | `SUBMITTED` |
| 已报价 | Quoted | `QUOTED` |
| 已确认 | Confirmed | `CONFIRMED` |
| 备货完成（等发货） | Ready | `READY` |
| 已取消 | Cancelled | `CANCELLED` |
| 组包中 | Assembling | `OpsOrder.Status.ASSEMBLING` |
| 已定向（发给了指定供应商） | Offered | `OFFERED` |
| 已挂单（市场可见） | Published | `PUBLISHED` |
| 已分派 | Assigned | `ASSIGNED` |
| 已完成 | Fulfilled | `FULFILLED` |
| 已接单 | Accepted | `SupplierOrder.Status.ACCEPTED` |
| 待签合同 | Contract pending | `CONTRACT_PENDING` |
| 已签合同 | Contracted | `CONTRACTED` |
| 生产中 | In production | `IN_PRODUCTION` |
| 已发往平台 | Shipped | `SHIPPED` |
| 物流配送中 | Out for delivery | 对客户的最后一段，**不是** `SHIPPED`（那是供应商发给平台） |

> ⚠ **状态词以后端枚举为准。** 前端 `pages/customer/status.ts` 里那 10 个词（pricing / toPublish / taken …）
> 是原型遗留，和后端 6 个状态对不上 —— 迁移时按后端对齐，不要照着前端那份翻。

## 二、报价与价格

| 中文 | 英文 | 依据 |
|---|---|---|
| 询价 | RFQ (request for quotation) | 行业标准缩写 |
| 报价 | Quote | 行业惯用；`Quotation` 更正式，界面上一律用 `Quote` |
| 报价单 | Quote | 同一份文件，不另造词 |
| 报价确认 | Quote acceptance | 客户点"接受"即成立 |
| 基准价 / 基准成本 | Base cost | 后端注释「AI 估的制造成本，不是价」 |
| 原价 | Base price ⚠ | 内部 CNY 价，见 `PriceCalculator`；⚠ 业务方叫法待确认 |
| 对客价 | Customer price | — |
| 客户确认价 | Confirmed price | 文档 13 |
| 对供价 | Supplier price | 文档 13 |
| 折率 | Discount rate | 后端 `discountRate` |
| 加成率 | Markup rate | 后端 `markupRate` |
| 汇率 | FX rate | 后端 `FxRate`；不用 `exchange rate`（太长，且和财务口径混） |
| 币种 | Currency | — |

## 三、零件与图纸

| 中文 | 英文 | 依据 |
|---|---|---|
| 零件 | Part | 后端 `PartDesign` / `CustomerOrderPart` |
| 零件版本 | Part revision | 后端 `PartRevision`；**不要**用 `version`（和乐观锁字段混） |
| 图纸 | Drawing | 后端 `PartDrawingService` |
| 图号 | Drawing number | — |
| 客户图号 | Customer drawing no. | — |
| 材料 | Material | — |
| 公差 | Tolerance | 机加工标准术语 |
| 表面处理 | Surface finishing | 行业标准 |
| 工序 | Process | 后端 `SupplierProfile.processes` |
| 加工尺寸 | Machining size | — |
| 加工精度 | Precision grade | 后端 `precisionGrade` |

## 四、供应商与派单

| 中文 | 英文 | 依据 |
|---|---|---|
| 供应商入驻 | Supplier onboarding | 后端 `supplier-onboarding` |
| 邀请 | Invite | `supplier_invite` |
| 派单 | Dispatch | 后端 `DispatchService`；**不用** `assignment` / `allocation` |
| 派单池 | Dispatch pool | — |
| 撤回 | Recall | 后端 `recallOpsOrder` |
| 接单 / 拒单 | Accept / Decline | 后端 `accept` / `decline` |
| 产能 | Capacity | — |
| 资质 | Qualification | — |
| 设备清单 | Equipment list | — |
| 交易方 | Party | 后端 `Party` |
| 组织 | Organization | 后端 `Organization` |
| 主数据 | Master data | — |

## 五、生产与质检

| 中文 | 英文 | 依据 |
|---|---|---|
| 质检 | QC (quality control) | 后端 `qc` 接口；**不用** `inspection`（那是动作，QC 是职能） |
| 返工 | Rework | 后端 `rework` |
| 重做 | Remake | 后端 `remake` |
| 开工 | Start production | 后端 `start` |
| 报完工 | Mark produced | 后端 `produced` |
| 发货 | Ship | 后端 `ship` |
| 交付 | Deliver | 对客户的交付，和 `Ship` 分开 |
| 三坐标 | CMM | Coordinate Measuring Machine，行业标准 |
| 检验报告 | Inspection report | — |
| 工时 | Machining time | — |

## 六、结算

| 中文 | 英文 | 依据 |
|---|---|---|
| 对账 | Reconciliation | 财务标准术语 |
| 开票 | Invoicing | — |
| 发票 | Invoice | — |
| 发票号 | Invoice number | — |
| 回款 | Payment received | 客户付给我们；**不用** `collection`（有催收含义） |
| 应付款日 | Due date | — |
| 背靠背结算 | Back-to-back settlement | 供应链金融标准术语 |
| 开票抬头 | Invoice title | — |
| 纳税人识别号 | Tax ID | 简称 TIN 亦可 |
| 统一社会信用代码 | Unified Social Credit Code (USCC) | 中国工商登记标准译法 |
| 开户行 | Bank name | — |

## 七、账号与认证

| 中文 | 英文 | 依据 |
|---|---|---|
| 登录 | Sign in | **不用** `Login`（名词/动词混用） |
| 注册 | Sign up / Register | 按钮用 `Sign up`，接口路径用 `/register` |
| 退出登录 | Sign out | — |
| 验证码 | Verification code | 不用 `OTP` 面向用户；代码里可以用 OTP |
| 密码 | Password | — |
| 邮箱 | Email | — |
| 企业邮箱 | Work email | 客户场景，强调不是个人邮箱 |

---

## 维护规则

1. **加一行要先于写代码** —— 页面里出现的英文必须能在这张表里找到出处
2. 标 ⚠ 的是我判断的，业务方确认后去掉 ⚠ 并写清依据
3. 同一个词**只允许一个译法**。真需要区分时，在中文侧先区分（比如「发货」和「交付」），不要靠英文侧硬分
