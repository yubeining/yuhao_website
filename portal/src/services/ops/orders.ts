/**
 * 运营端：客户订单（后端 OpsCustomerOrderController）。跨客户，只含提交过的单。
 */

import { http, putToSignedUrl } from '../core/http'
import type {
    OrderDocumentView, OrderLineView, OrderShipment, OrderStatus, PagedResponse, ShipTo,
} from '../customer/orders'
import type { UploadTicket, ViewUrl } from '../customer/parts'

export interface OpsOrderSummaryView {
    id: string
    customerOrgId: string
    customerName?: string | null
    title?: string | null
    status: OrderStatus
    /** 客户期望的交货日期（yyyy-MM-dd），仅参考 */
    wantedDate?: string | null
    lineCount: number
    totalQuantity: number
    createdAt: string
    submittedAt?: string | null
}

export interface OpsOrderView {
    id: string
    customerOrgId: string
    customerName?: string | null
    title?: string | null
    status: OrderStatus
    wantedDate?: string | null
    createdAt: string
    submittedAt?: string | null
    shipTo?: ShipTo | null
    lines: OrderLineView[]
    shipment?: OrderShipment | null
    documents: OrderDocumentView[]
}

/** 最近提交的在前。status 不传 = 全部。 */
export function listOpsOrders(status?: OrderStatus, page = 1, pageSize = 50): Promise<PagedResponse<OpsOrderSummaryView>> {
    const st = status ? `&status=${status}` : ''
    return http.get<PagedResponse<OpsOrderSummaryView>>(`/ops/customer-orders?page=${page}&pageSize=${pageSize}${st}`)
}

export function getOpsOrder(orderId: string): Promise<OpsOrderView> {
    return http.get<OpsOrderView>(`/ops/customer-orders/${orderId}`)
}

/** 运营看图：和客户端同样的校验，按订单记审计。 */
export function opsLineFilePreviewUrl(orderId: string, lineId: string, fileId: string): Promise<ViewUrl> {
    return http.get<ViewUrl>(`/ops/customer-orders/${orderId}/lines/${lineId}/files/${fileId}/preview-url`)
}

export function opsLineFileViewUrl(orderId: string, lineId: string, fileId: string): Promise<ViewUrl> {
    return http.get<ViewUrl>(`/ops/customer-orders/${orderId}/lines/${lineId}/files/${fileId}/view-url`)
}

/** 整单发给客户：只有待发货（READY）的单能发；承运商、运单号必填（2026-11-24）。 */
export function shipOrder(orderId: string, carrier: string, trackingNo: string): Promise<OpsOrderView> {
    return http.post<OpsOrderView>(`/ops/customer-orders/${orderId}/ship`, { carrier, trackingNo })
}

/**
 * 传一份随货文件：申请上传 → 浏览器直传对象存储 → 通知后端按内容判类型（PDF / JPG / PNG）。
 * 待发货、已发货时都能传；客户确认收货后 409 order.documents_locked。
 */
export async function uploadOrderDocument(orderId: string, file: File): Promise<OrderDocumentView> {
    const base = `/ops/customer-orders/${orderId}/documents`
    const ticket = await http.post<UploadTicket>(base, { filename: file.name, contentType: file.type })
    await putToSignedUrl(ticket.uploadUrl, file, ticket.contentType)
    return http.post<OrderDocumentView>(`${base}/${ticket.fileId}/complete`)
}

export function opsOrderDocumentViewUrl(orderId: string, documentId: string): Promise<ViewUrl> {
    return http.get<ViewUrl>(`/ops/customer-orders/${orderId}/documents/${documentId}/view-url`)
}
