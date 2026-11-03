/**
 * 客户端的状态 → 药丸映射。
 *
 * ★ 文案集中在这里，页面不写字面量 —— 同一个状态在列表、详情、概览三处出现，
 *   散着写迟早出现「生产中 / 加工中」这种同状态两种说法。
 *
 * ★★ 已接后端的三种状态（订单 / 零件行 / 报价）做成了**工厂函数**：
 *   文案随语言变，所以不能是模块级常量 —— 常量在模块加载时就把中文定死了。
 *
 * ★★★ 兼容别名 `ORDER_ST` / `QUOTE_ST`：ops 端和供应商端还有几个页面没迁移文案，
 *   它们仍按「中文常量」在用。等那些页面迁完（inventory 第 4 批）删掉这两个别名，
 *   别让它们长期留着 —— 那是两份真相的开始。
 */

import type { PillSpec } from '../../components/ui'
import type { LineStat, OrderStatus, PartExecStatus, Quote } from '../../mock/types'
import type {
    LineFulfillmentStatus, OrderStatus as ApiOrderStatus, QuoteStatus as ApiQuoteStatus,
} from '../../services'
import { STRINGS, type Strings } from '../../i18n/strings'

/** 真订单的状态（发货之后的状态等做到那一步再加）。 */
export const orderSt = (t: Strings): Record<ApiOrderStatus, PillSpec> => ({
    DRAFT: ['ne', t.status.order.DRAFT],
    SUBMITTED: ['in', t.status.order.SUBMITTED],
    QUOTED: ['wa', t.status.order.QUOTED],
    CONFIRMED: ['ok', t.status.order.CONFIRMED],
    READY: ['ok', t.status.order.READY],
    CANCELLED: ['ba', t.status.order.CANCELLED],
})

/**
 * 零件行的进度 —— 客户只看得到这四个（文档 12 §7）。
 * 供应侧的返工、报废、换供应商都折在「进行中」里，客户看不到，也不该看到。
 */
export const lineFulfillSt = (t: Strings): Record<LineFulfillmentStatus, PillSpec> => ({
    PENDING: ['ne', t.status.line.PENDING],
    IN_PROGRESS: ['in', t.status.line.IN_PROGRESS],
    FULFILLED: ['ok', t.status.line.FULFILLED],
    CANCELLED: ['ba', t.status.line.CANCELLED],
})

/** 真报价的状态。客户只会看到待确认 / 已确认两种。 */
export const quoteSt = (t: Strings): Record<ApiQuoteStatus, PillSpec> => ({
    SENT: ['wa', t.status.quote.SENT],
    SUPERSEDED: ['ne', t.status.quote.SUPERSEDED],
    REJECTED: ['ba', t.status.quote.REJECTED],
    CONFIRMED: ['ok', t.status.quote.CONFIRMED],
})

// ---------- 兼容别名（待删）----------
// ops / supplier 端还有页面没迁移文案，暂时用中文那一份。
// ★ 迁移完那批页面就删掉这两行，别让新代码再用它们。
/** @deprecated 用 orderSt(t) —— 这里固定返回中文 */
export const ORDER_ST = orderSt(STRINGS.zh)
/** @deprecated 用 quoteSt(t) —— 这里固定返回中文 */
export const QUOTE_ST = quoteSt(STRINGS.zh)

/** 订单状态。整条链就是它在推进。 */
// i18n-exempt-start: 以下四张表服务于尚未迁移的原型页，随 mock 层一起删除
export const ORD_ST: Record<OrderStatus, PillSpec> = {
    draft: ['ne', '草稿中'],
    pricing: ['in', '待估价'],
    quoted: ['wa', '已估价'],
    toPublish: ['wa', '待安排生产'],
    published: ['in', '已安排生产'],
    taken: ['in', '已接单'],
    toProduce: ['in', '待生产'],
    producing: ['in', '生产中'],
    produced: ['ok', '生产完成'],
    shipping: ['ok', '物流配送中'],
}

export const QT_ST: Record<Quote['status'], PillSpec> = {
    open: ['wa', '待确认'],
    accepted: ['ok', '已确认'],
}

/** 零件信息够不够报价 */
export const PART_ST: Record<LineStat, PillSpec> = {
    ready: ['ok', '可报价'],
    pending: ['wa', '待补齐'],
    blocked: ['ba', '缺必填'],
}

/** 零件的执行状态。只有四个 —— 零件层面不走订单那套完整流程。 */
export const EXEC_ST: Record<PartExecStatus, PillSpec> = {
    waiting: ['wa', '待接单'],
    taken: ['in', '已接单'],
    producing: ['in', '生产中'],
    produced: ['ok', '生产完成'],
}
// i18n-exempt-end

/*
 * ★ 这里曾经有一组「待排产 / 加工 / 表面处理 / 出厂质检 / 完工」的工序阶段。
 *   删掉了 —— 它是编的，而且是**拿完成数量假装出来的**：
 *   stage 由 `done >= qty ? 4 : done > 0 ? 1 : 0` 算出，
 *   所以「表面处理」和「出厂质检」两个节点永远不会亮。
 *
 *   平台目前从供应商那里只收到一个信号：**完成了多少件**。
 *   工序级的进度需要供应商按工序上报，那个机制还不存在。
 *   在它存在之前，进度就只显示完成数量。
 */

/**
 * 已经发布到订单市场之后的所有状态。
 * 页面用它判断「这单是不是已经在外面跑了」—— 是的话才显示执行进度。
 */
const AFTER_PUBLISH: OrderStatus[] = [
    'published', 'taken', 'toProduce', 'producing', 'produced', 'shipping',
]
export const isPublished = (st: OrderStatus) => AFTER_PUBLISH.includes(st)
