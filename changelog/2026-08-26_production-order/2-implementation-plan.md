# 实施计划 —— 生产订单

## 模型

`Pkg`（派单包，一包一个零件，自动生成）整体换成：

```
Prod      生产订单：id / lines / total / status / exp / sup / contractId ...
ProdLine  行：orderId + partId + 名称/材料/数量/目标价/交期要求的快照
```

**行上带 orderId 而不是生产订单上带** —— 这是「能跨客户订单」直接推出来的。
生产订单不属于任何一个客户订单，它只是「装着」若干客户订单的零件。

一个零件最多进一个生产订单（数量不拆），所以 `assignedProd(partId)` 返回单值；
没有归属的零件就在 `freeParts()` 这个池子里等着被组。

## 状态

```
draft → open → taken → done
              ↘ dropped（超时无人抢，行上的零件回到池子）
```

`draft` 是「运营还在组」。有这个态才谈得上「组装」——
没有草稿就只能一次性提交，组包这件事就退化成了自动生成。

## 客户订单状态的汇总规则

零件的执行状态由它所在的生产订单推出来，客户订单状态再由零件汇总。

**关键一条**：还没安排进生产订单的零件**留在汇总里、且没有执行状态**，
于是 `全部已接单` / `全部生产完成` 自然为假 ——
一个客户订单只安排了一半时不会显示成「已接单」。
客户看到「已接单」会以为产能全锁定了。

## 被否决的方案

**A. 保留 Pkg，另加一层「生产订单」包着它。**
否决：两层容器表达的是同一件事，且 Pkg 上的 orderId 会和跨客户直接冲突。

**B. 行上存零件引用而不是快照。**
否决：挂出去之后零件被改（换材料、改图纸），已经被抢走的那一单标的就变了。
快照是 C2 的要求。

**C. 「退回」只退其中一行。**
否决：一个生产订单一个供应商，整单抢走的东西没有「只退一行」这回事。
要拆开就是重新组两个包。

**D. 调价重挂让运营逐行填新价。**
否决：一单几十行，逐行改价等于重组一遍。改成填一个统一涨幅百分比。

## 改动清单

| 文件 | 改动 |
|---|---|
| `mock/types.ts` | `Pkg` → `Prod` + `ProdLine`；`Contract.pkgId` → `prodId`；`Invoice.pkgId` → `prodId`；`Db.pkgs` → `prods`；`Seq.dp` → `po` |
| `mock/actions.ts` | 删 `publishOrder`；加 `assignedProd` / `freeParts` / `createProd` / `addProdLine` / `removeProdLine` / `deleteProd` / `publishProd` / `syncProd` / `dropProd`；`grab` / `sign` / `schedule` / `repost` / `report` / `deliver` / `uploadInvoice` 全部改到生产订单维度 |
| `mock/selectors.ts` | `myPkgs`→`myProds`、`pkgsOf`→`prodsOf`、`openPkgs`→`openProds`，新增 `draftProds` |
| `pages/ops/DispatchPage.tsx` | 重写：未安排零件池（可跨客户勾选）+ 生产订单列表 |
| `pages/ops/ProdPage.tsx` | 新增：组包、挂出、抢单跟踪、调价重挂、退回 |
| `pages/ops/OrdersPage.tsx` | 加「生产订单」列；接收从派单管理挪过来的发货 / 回款登记 |
| `pages/supplier/*` | 市场、详情、我抢到的、我的订单、对账全部改成生产订单维度；报工按行 |
| `pages/customer/OrderDetailPage.tsx` | **删掉「发布到订单市场」按钮** |
| `pages/customer/status.ts` | 「待发布」→「待安排生产」，「已发布」→「已安排生产」 |
