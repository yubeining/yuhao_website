/**
 * 客户端：订单（后端 CustomerOrderController）。
 *
 * 状态是后端现在真有的五个；派单之后的状态随后续步骤加。
 *
 * ★ 后端不输出值为 null 的字段，可能为空的字段一律可选（见 parts.ts 顶部说明）。
 */

import { http } from '../core/http'
import type { RevisionView, ViewUrl } from './parts'

export type OrderStatus = 'DRAFT' | 'SUBMITTED' | 'QUOTED' | 'CONFIRMED' | 'CANCELLED'

export interface PagedResponse<T> {
    items: T[]
    /** 从 1 开始 */
    page: number
    pageSize: number
    total: number
    totalPages: number
}

export interface OrderSummaryView {
    id: string
    title?: string | null
    status: OrderStatus
    /** 客户期望的交货天数，仅参考 */
    wantedLeadDays?: number | null
    lineCount: number
    totalQuantity: number
    createdAt: string
    submittedAt?: string | null
}

export interface OrderLineView {
    id: string
    partId: string
    /** 图号 */
    code: string
    /** 这一行上的零件名称快照 */
    partName: string
    quantity: number
    material?: string | null
    surfaceTreatment?: string | null
    /** 这一行锁定的图纸版本 */
    revision: RevisionView
}

export interface OrderView {
    id: string
    title?: string | null
    status: OrderStatus
    wantedLeadDays?: number | null
    createdAt: string
    submittedAt?: string | null
    lines: OrderLineView[]
}

export interface OrderDraftInput {
    title: string | null
    wantedLeadDays: number | null
}

export interface LineInput {
    code: string
    name: string
    quantity: number
    material: string | null
    surfaceTreatment: string | null
    customerRev?: string | null
}

export function listOrders(page = 1, pageSize = 20): Promise<PagedResponse<OrderSummaryView>> {
    return http.get<PagedResponse<OrderSummaryView>>(`/customer/orders?page=${page}&pageSize=${pageSize}`)
}

export function getOrder(orderId: string): Promise<OrderView> {
    return http.get<OrderView>(`/customer/orders/${orderId}`)
}

export function createOrder(input: OrderDraftInput): Promise<OrderView> {
    return http.post<OrderView>('/customer/orders', input)
}

export function updateOrder(orderId: string, input: OrderDraftInput): Promise<OrderView> {
    return http.patch<OrderView>(`/customer/orders/${orderId}`, input)
}

/** 每行都要有传完的图纸，否则 409 order.line_missing_drawing。提交时锁定各行图纸版本。 */
export function submitOrder(orderId: string): Promise<OrderView> {
    return http.post<OrderView>(`/customer/orders/${orderId}/submit`)
}

/** 只能取消草稿。 */
export function cancelOrder(orderId: string): Promise<OrderView> {
    return http.post<OrderView>(`/customer/orders/${orderId}/cancel`)
}

/** 图号命中本客户已有零件时，挂上次锁定的图纸版本；否则新建零件和第 1 版。 */
export function addLine(orderId: string, input: LineInput): Promise<OrderLineView> {
    return http.post<OrderLineView>(`/customer/orders/${orderId}/lines`, input)
}

export function updateLine(orderId: string, lineId: string, input: Omit<LineInput, 'code' | 'customerRev'>): Promise<OrderLineView> {
    return http.patch<OrderLineView>(`/customer/orders/${orderId}/lines/${lineId}`, input)
}

/** 返回删除后的订单。 */
export function removeLine(orderId: string, lineId: string): Promise<OrderView> {
    return http.delete<OrderView>(`/customer/orders/${orderId}/lines/${lineId}`)
}

/** 「换图纸」：当前版本已锁定时开一个新版本，并把这一行改挂到新版本。 */
export function startNewRevision(orderId: string, lineId: string, customerRev: string | null): Promise<OrderLineView> {
    return http.post<OrderLineView>(`/customer/orders/${orderId}/lines/${lineId}/new-revision`, { customerRev })
}

/** 在订单里看图：后端校验这一行确实锁的是这个文件的版本，并按订单记审计。 */
export function lineFileViewUrl(orderId: string, lineId: string, fileId: string): Promise<ViewUrl> {
    return http.get<ViewUrl>(`/customer/orders/${orderId}/lines/${lineId}/files/${fileId}/view-url`)
}
