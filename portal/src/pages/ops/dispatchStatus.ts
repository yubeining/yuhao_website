/**
 * 派单相关的状态 → 药丸 / 文案。运营端和供应商端共用，集中在这里，不在页面里写字面量。
 */

import type { PillSpec } from '../../components/ui'
import type { CancelReason, DispatchMode, LineStatus, OpsOrderStatus, SupplierOrderStatus } from '../../services'

export const OPS_ORDER_ST: Record<OpsOrderStatus, PillSpec> = {
    ASSEMBLING: ['ne', '组装中'],
    OFFERED: ['wa', '已定向派出'],
    PUBLISHED: ['wa', '已挂全市场'],
    ASSIGNED: ['ok', '供应商已接'],
    FULFILLED: ['ok', '零件已全部合格'],
}

export const DISPATCH_MODE: Record<DispatchMode, string> = {
    TARGETED: '定向派单',
    MARKET: '挂全市场',
}

export const OFFER_ST: Record<'OFFERED' | 'DECLINED' | 'REVOKED', PillSpec> = {
    OFFERED: ['wa', '待回应'],
    DECLINED: ['ba', '已拒接'],
    REVOKED: ['ne', '已收回'],
}

export const SUPPLIER_ORDER_ST: Record<SupplierOrderStatus, PillSpec> = {
    ACCEPTED: ['in', '已接单 · 等合同'],
    CONTRACT_PENDING: ['wa', '待供应商签字'],
    CONTRACTED: ['ok', '已签字 · 待开工'],
    IN_PRODUCTION: ['in', '生产中'],
    SHIPPED: ['wa', '已到平台 · 待质检'],
    FULFILLED: ['ok', '已全部合格'],
    CANCELLED: ['ne', '已取消'],
}

/**
 * 叶子零件行的状态（2026-09-20）。运营端和供应商端共用同一套文案 ——
 * 这一层本来就是同一件事的两个视角，两边说法不一致会当场引起争议。
 */
export const LINE_ST: Record<LineStatus, PillSpec> = {
    PENDING: ['ne', '待开工'],
    IN_PRODUCTION: ['in', '生产中'],
    PRODUCED: ['wa', '已完工 · 待发出'],
    QC_PENDING: ['wa', '待质检'],
    QC_PASSED: ['ok', '质检合格'],
    SUPERSEDED: ['ne', '已被拆分替代'],
    SCRAPPED: ['ba', '已报废'],
    CANCELLED: ['ne', '已取消'],
}

export const CANCEL_REASON: Record<CancelReason, string> = {
    WITHDRAWN: '供应商退单',
    REVOKED: '运营收回',
    SIGN_TIMEOUT: '超时未签字',
}

/**
 * 生产订单的显示编号：id 的前 8 位。编号规则至今没定（和零件编号同一个待定项），
 * 先用 id 片段区分，不编一个像样的单号。
 */
export const shortId = (id: string) => id.slice(0, 8).toUpperCase()
