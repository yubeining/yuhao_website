/**
 * 供应商端：派给我的 / 市场上的单、接单、拒接、我的订单、退单（后端 SupplierOfferController / SupplierPriceController）。
 *
 * ★ 这里拿到的都不含客户信息（客户是谁、对客价）—— 后端就不给。
 * ★ 对供价：接单前按我当前的折率现算，接单时锁定。
 */

import { http } from '../core/http'
import type { FileView, ViewUrl } from '../customer/parts'

export interface SupplierOfferSummary {
    id: string
    dispatchMode: 'TARGETED' | 'MARKET'
    supplierDueDate: string
    dispatchedAt: string
    lineCount: number
    totalQuantity: number
}

/** 叶子零件行。`status` / `replacesPartId` 只有接单之后的行才有，派单大厅里的行没有。 */
export interface SupplierLine {
    id: string
    code: string
    partName: string
    quantity: number
    material?: string | null
    surfaceTreatment?: string | null
    files: FileView[]
    status?: LineStatus | null
    /** 这一行是从哪一行拆出来的（返工 / 重做件） */
    replacesPartId?: string | null
}

export type LineStatus =
    | 'PENDING' | 'IN_PRODUCTION' | 'PRODUCED' | 'QC_PENDING' | 'QC_PASSED'
    | 'SUPERSEDED' | 'SCRAPPED' | 'CANCELLED'

export interface SupplierOffer {
    id: string
    dispatchMode: 'TARGETED' | 'MARKET'
    supplierDueDate: string
    dispatchedAt: string
    lines: SupplierLine[]
}

export interface SupplierOrderView {
    id: string
    opsOrderId: string
    status: 'ACCEPTED' | 'CONTRACT_PENDING' | 'CONTRACTED' | 'IN_PRODUCTION' | 'SHIPPED' | 'FULFILLED' | 'CANCELLED'
    supplierDueDate: string
    acceptedAt: string
    contractCreatedAt?: string | null
    signedAt?: string | null
    /** 接单 + 7 天；到点没签字系统自动取消，单子回平台重派 */
    signByDeadline: string
    cancelledAt?: string | null
    cancelReason?: 'WITHDRAWN' | 'REVOKED' | 'SIGN_TIMEOUT' | null
    lines: SupplierLine[]
}

export interface LinePrice {
    lineId: string
    unitPriceCny: number
    lineTotalCny: number
}

export interface OfferPrice {
    opsOrderId: string
    total: number
    lines: LinePrice[]
}

export interface OrderPrice {
    supplierOrderId: string
    total: number
    lines: LinePrice[]
}

export function listSupplierOffers(): Promise<SupplierOfferSummary[]> {
    return http.get<SupplierOfferSummary[]>('/supplier/offers')
}

export function getSupplierOffer(id: string): Promise<SupplierOffer> {
    return http.get<SupplierOffer>(`/supplier/offers/${id}`)
}

export function acceptSupplierOffer(id: string): Promise<SupplierOrderView> {
    return http.post<SupplierOrderView>(`/supplier/offers/${id}/accept`)
}

export function declineSupplierOffer(id: string): Promise<unknown> {
    return http.post(`/supplier/offers/${id}/decline`)
}

export function supplierOfferFileUrl(id: string, lineId: string, fileId: string): Promise<ViewUrl> {
    return http.get<ViewUrl>(`/supplier/offers/${id}/lines/${lineId}/files/${fileId}/view-url`)
}

export function listSupplierOrders(): Promise<SupplierOrderView[]> {
    return http.get<SupplierOrderView[]>('/supplier/orders')
}

/** 签字 = 锁定：签完退不了也改不了。 */
export function signSupplierOrder(id: string): Promise<SupplierOrderView> {
    return http.post<SupplierOrderView>(`/supplier/orders/${id}/sign`)
}

export function withdrawSupplierOrder(id: string): Promise<SupplierOrderView> {
    return http.post<SupplierOrderView>(`/supplier/orders/${id}/withdraw`)
}

/** 报开工（2026-09-20：只报开工 / 完工，不报件数）。 */
export function startSupplierLine(orderId: string, lineId: string): Promise<SupplierOrderView> {
    return http.post<SupplierOrderView>(`/supplier/orders/${orderId}/lines/${lineId}/start`)
}

export function producedSupplierLine(orderId: string, lineId: string): Promise<SupplierOrderView> {
    return http.post<SupplierOrderView>(`/supplier/orders/${orderId}/lines/${lineId}/produced`)
}

/** 发给平台：整单全部完工才能发；返工 / 重做的行做完后再发那几行。 */
export function shipSupplierOrder(orderId: string): Promise<SupplierOrderView> {
    return http.post<SupplierOrderView>(`/supplier/orders/${orderId}/ship`)
}

export function supplierOrderFileUrl(id: string, lineId: string, fileId: string): Promise<ViewUrl> {
    return http.get<ViewUrl>(`/supplier/orders/${id}/lines/${lineId}/files/${fileId}/view-url`)
}

export function supplierOfferPrices(opsOrderIds: string[]): Promise<OfferPrice[]> {
    if (!opsOrderIds.length) return Promise.resolve([])
    return http.get<OfferPrice[]>(`/supplier/offer-prices?opsOrderIds=${opsOrderIds.join(',')}`)
}

export function supplierOrderPrices(): Promise<OrderPrice[]> {
    return http.get<OrderPrice[]>('/supplier/order-prices')
}
