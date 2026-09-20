/**
 * 客户端的状态 → 药丸映射。
 *
 * ★ 文案集中在这里，页面不写字面量 —— 同一个状态在列表、详情、概览三处出现，
 *   散着写迟早出现「生产中 / 加工中」这种同状态两种说法。
 */

import type { PillSpec } from '../../components/ui'
import type { LineStat, OrderStatus, PartExecStatus, Quote } from '../../mock/types'
import type {
    LineFulfillmentStatus, OrderStatus as ApiOrderStatus, QuoteStatus as ApiQuoteStatus,
} from '../../services'

/** 真订单的状态（发货之后的状态等做到那一步再加）。 */
export const ORDER_ST: Record<ApiOrderStatus, PillSpec> = {
    DRAFT: ['ne', '草稿中'],
    SUBMITTED: ['in', '已提交'],
    QUOTED: ['wa', '待确认报价'],
    CONFIRMED: ['ok', '已确认报价'],
    READY: ['ok', '已完工 · 待发货'],
    CANCELLED: ['ba', '已取消'],
}

/**
 * 零件行的进度 —— 客户只看得到这四个（文档 12 §7）。
 * 供应侧的返工、报废、换供应商都折在「进行中」里，客户看不到，也不该看到。
 */
export const LINE_FULFILL_ST: Record<LineFulfillmentStatus, PillSpec> = {
    PENDING: ['ne', '待安排'],
    IN_PROGRESS: ['in', '进行中'],
    FULFILLED: ['ok', '已完成'],
    CANCELLED: ['ba', '已取消'],
}

/** 真报价的状态。客户只会看到待确认 / 已确认两种。 */
export const QUOTE_ST: Record<ApiQuoteStatus, PillSpec> = {
    SENT: ['wa', '待确认'],
    SUPERSEDED: ['ne', '已被重报取代'],
    REJECTED: ['ba', '已拒绝'],
    CONFIRMED: ['ok', '已确认'],
}

/** 订单状态。整条链就是它在推进。 */
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
