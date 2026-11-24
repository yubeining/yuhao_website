/**
 * 客户端的状态 → 药丸映射。
 *
 * ★ 文案集中在这里，页面不写字面量 —— 同一个状态在列表、详情、概览三处出现，
 *   散着写迟早出现「生产中 / 加工中」这种同状态两种说法。
 *
 * ★★ 已接后端的三种状态（订单 / 零件行 / 报价）做成了**工厂函数**：
 *   文案随语言变，所以不能是模块级常量 —— 常量在模块加载时就把中文定死了。
 */

import type { PillSpec } from '../../components/ui'
import type {
    LineFulfillmentStatus, OrderStatus as ApiOrderStatus, QuoteStatus as ApiQuoteStatus,
} from '../../services'
import type { Strings } from '../../i18n/strings'

/** 真订单的状态（发货之后的状态等做到那一步再加）。 */
export const orderSt = (t: Strings): Record<ApiOrderStatus, PillSpec> => ({
    DRAFT: ['ne', t.status.order.DRAFT],
    SUBMITTED: ['in', t.status.order.SUBMITTED],
    QUOTED: ['wa', t.status.order.QUOTED],
    CONFIRMED: ['ok', t.status.order.CONFIRMED],
    READY: ['ok', t.status.order.READY],
    SHIPPED: ['in', t.status.order.SHIPPED],
    COMPLETED: ['ok', t.status.order.COMPLETED],
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
