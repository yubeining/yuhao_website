/**
 * 派单相关的状态 → 药丸 / 文案。运营端和供应商端共用，集中在这里，不在页面里写字面量。
 */

import type { PillSpec } from '../../components/ui'
import type { CancelReason, DispatchMode, LineStatus, OpsOrderStatus, SupplierOrderStatus } from '../../services'
import { STRINGS, type Strings } from '../../i18n/strings'

export const opsOrderSt = (t: Strings): Record<OpsOrderStatus, PillSpec> => ({
    ASSEMBLING: ['ne', t.dispatch.opsOrder.ASSEMBLING],
    OFFERED: ['wa', t.dispatch.opsOrder.OFFERED],
    PUBLISHED: ['wa', t.dispatch.opsOrder.PUBLISHED],
    ASSIGNED: ['ok', t.dispatch.opsOrder.ASSIGNED],
    FULFILLED: ['ok', t.dispatch.opsOrder.FULFILLED],
})

export const dispatchMode = (t: Strings): Record<DispatchMode, string> => ({
    TARGETED: t.dispatch.mode.TARGETED,
    MARKET: t.dispatch.mode.MARKET,
})

export const offerSt = (t: Strings): Record<'OFFERED' | 'DECLINED' | 'REVOKED', PillSpec> => ({
    OFFERED: ['wa', t.dispatch.offer.OFFERED],
    DECLINED: ['ba', t.dispatch.offer.DECLINED],
    REVOKED: ['ne', t.dispatch.offer.REVOKED],
})

export const supplierOrderSt = (t: Strings): Record<SupplierOrderStatus, PillSpec> => ({
    ACCEPTED: ['in', t.dispatch.supplierOrder.ACCEPTED],
    CONTRACT_PENDING: ['wa', t.dispatch.supplierOrder.CONTRACT_PENDING],
    CONTRACTED: ['ok', t.dispatch.supplierOrder.CONTRACTED],
    IN_PRODUCTION: ['in', t.dispatch.supplierOrder.IN_PRODUCTION],
    SHIPPED: ['wa', t.dispatch.supplierOrder.SHIPPED],
    FULFILLED: ['ok', t.dispatch.supplierOrder.FULFILLED],
    CANCELLED: ['ne', t.dispatch.supplierOrder.CANCELLED],
})

/**
 * 叶子零件行的状态（2026-09-20）。运营端和供应商端共用同一套文案 ——
 * 这一层本来就是同一件事的两个视角，两边说法不一致会当场引起争议。
 */
export const lineSt = (t: Strings): Record<LineStatus, PillSpec> => ({
    PENDING: ['ne', t.dispatch.line.PENDING],
    IN_PRODUCTION: ['in', t.dispatch.line.IN_PRODUCTION],
    PRODUCED: ['wa', t.dispatch.line.PRODUCED],
    QC_PENDING: ['wa', t.dispatch.line.QC_PENDING],
    QC_PASSED: ['ok', t.dispatch.line.QC_PASSED],
    SUPERSEDED: ['ne', t.dispatch.line.SUPERSEDED],
    SCRAPPED: ['ba', t.dispatch.line.SCRAPPED],
    CANCELLED: ['ne', t.dispatch.line.CANCELLED],
})

export const cancelReason = (t: Strings): Record<CancelReason, string> => ({
    WITHDRAWN: t.dispatch.cancelReason.WITHDRAWN,
    REVOKED: t.dispatch.cancelReason.REVOKED,
    SIGN_TIMEOUT: t.dispatch.cancelReason.SIGN_TIMEOUT,
})

// ---------- 兼容别名（待删）----------
// ops 端还有页面没迁移文案，先用中文那一份。迁完删掉。
/** @deprecated 用 opsOrderSt(t) */
export const OPS_ORDER_ST = opsOrderSt(STRINGS.zh)
/** @deprecated 用 dispatchMode(t) */
export const DISPATCH_MODE = dispatchMode(STRINGS.zh)
/** @deprecated 用 offerSt(t) */
export const OFFER_ST = offerSt(STRINGS.zh)
/** @deprecated 用 supplierOrderSt(t) */
export const SUPPLIER_ORDER_ST = supplierOrderSt(STRINGS.zh)
/** @deprecated 用 lineSt(t) */
export const LINE_ST = lineSt(STRINGS.zh)
/** @deprecated 用 cancelReason(t) */
export const CANCEL_REASON = cancelReason(STRINGS.zh)

/**
 * 生产订单的显示编号：id 的前 8 位。编号规则至今没定（和零件编号同一个待定项），
 * 先用 id 片段区分，不编一个像样的单号。
 */
export const shortId = (id: string) => id.slice(0, 8).toUpperCase()
