/**
 * 运营端：客户订单（后端 OpsCustomerOrderController）。跨客户，只含提交过的单。
 */

import { http } from '../core/http'
import type { OrderLineView, OrderStatus, PagedResponse } from '../customer/orders'
import type { ViewUrl } from '../customer/parts'

export interface OpsOrderSummaryView {
    id: string
    customerOrgId: string
    customerName?: string | null
    title?: string | null
    status: OrderStatus
    /** 客户期望的交货天数，仅参考 */
    wantedLeadDays?: number | null
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
    wantedLeadDays?: number | null
    createdAt: string
    submittedAt?: string | null
    lines: OrderLineView[]
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
export function opsLineFileViewUrl(orderId: string, lineId: string, fileId: string): Promise<ViewUrl> {
    return http.get<ViewUrl>(`/ops/customer-orders/${orderId}/lines/${lineId}/files/${fileId}/view-url`)
}
