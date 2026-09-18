/**
 * 派单相关的状态 → 药丸 / 文案。运营端和供应商端共用，集中在这里，不在页面里写字面量。
 */

import type { PillSpec } from '../../components/ui'
import type { DispatchMode, OpsOrderStatus } from '../../services'

export const OPS_ORDER_ST: Record<OpsOrderStatus, PillSpec> = {
    ASSEMBLING: ['ne', '组装中'],
    OFFERED: ['wa', '已定向派出'],
    PUBLISHED: ['wa', '已挂全市场'],
    ASSIGNED: ['ok', '供应商已接'],
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

export const SUPPLIER_ORDER_ST: Record<'ACCEPTED' | 'CANCELLED', PillSpec> = {
    ACCEPTED: ['ok', '已接单'],
    CANCELLED: ['ne', '已取消'],
}

export const CANCEL_REASON: Record<'WITHDRAWN' | 'REVOKED', string> = {
    WITHDRAWN: '供应商退单',
    REVOKED: '运营收回',
}

/**
 * 生产订单的显示编号：id 的前 8 位。编号规则至今没定（和零件编号同一个待定项），
 * 先用 id 片段区分，不编一个像样的单号。
 */
export const shortId = (id: string) => id.slice(0, 8).toUpperCase()
