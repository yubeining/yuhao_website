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

export interface SupplierLine {
    id: string
    code: string
    partName: string
    quantity: number
    material?: string | null
    surfaceTreatment?: string | null
    files: FileView[]
}

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
    status: 'ACCEPTED' | 'CANCELLED'
    supplierDueDate: string
    acceptedAt: string
    cancelledAt?: string | null
    cancelReason?: 'WITHDRAWN' | 'REVOKED' | null
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

export function withdrawSupplierOrder(id: string): Promise<SupplierOrderView> {
    return http.post<SupplierOrderView>(`/supplier/orders/${id}/withdraw`)
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
