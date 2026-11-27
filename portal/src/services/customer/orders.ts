/**
 * 客户端：订单（后端 CustomerOrderController）。
 *
 * 发货（2026-11-24）：READY → 运营发货 → SHIPPED → 客户确认收货 → COMPLETED。
 *
 * ★ 后端不输出值为 null 的字段，可能为空的字段一律可选（见 parts.ts 顶部说明）。
 */

import { http } from '../core/http'
import type { RevisionView, ViewUrl } from './parts'

export type OrderStatus = 'DRAFT' | 'SUBMITTED' | 'QUOTED' | 'CONFIRMED' | 'READY' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED'

/** 客户看得到的零件进度 —— 只有四态；返工、报废、换供应商一律折成「进行中」（文档 12 §7）。 */
export type LineFulfillmentStatus = 'PENDING' | 'IN_PROGRESS' | 'FULFILLED' | 'CANCELLED'

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
    /** 客户期望的交货日期（yyyy-MM-dd），仅参考 */
    wantedDate?: string | null
    lineCount: number
    totalQuantity: number
    createdAt: string
    submittedAt?: string | null
}

export interface OrderLineView {
    id: string
    partId: string
    /** 图号。草稿里可以没填（2026-11-27） */
    code?: string | null
    /** 这一行上的零件名称快照。草稿里可以没填 */
    partName?: string | null
    /** 草稿里可以没填；提交前必须有 */
    quantity?: number | null
    material?: string | null
    surfaceTreatment?: string | null
    /** 进度：待安排 / 进行中 / 已完成 */
    fulfillmentStatus: LineFulfillmentStatus
    /** 这一行锁定的图纸版本 */
    revision: RevisionView
}

/** 收货地址（2026-11-23）。country 是 ISO 3166-1 两位代码；line2 / region / postalCode 选填。 */
export interface ShipTo {
    country: string
    company: string
    contact: string
    phone: string
    line1: string
    line2?: string | null
    city: string
    region?: string | null
    postalCode?: string | null
}

export interface OrderView {
    id: string
    title?: string | null
    status: OrderStatus
    wantedDate?: string | null
    createdAt: string
    submittedAt?: string | null
    /** 没填过就没有这个字段 */
    shipTo?: ShipTo | null
    lines: OrderLineView[]
    /** 运营发货之后才有 */
    shipment?: OrderShipment | null
    /** 传完的随货文件（质检报告 / 材质证明，不分类）；没有就是空数组 */
    documents: OrderDocumentView[]
}

/** 发货信息（2026-11-24）：承运商是自由文本。 */
export interface OrderShipment {
    carrier: string
    trackingNo: string
    shippedAt: string
    /** 客户确认收货后才有 */
    receivedAt?: string | null
}

export interface OrderDocumentView {
    id: string
    originalFilename: string
    uploadStatus: 'PENDING' | 'COMPLETED' | 'REJECTED'
    sizeBytes?: number | null
    completedAt?: string | null
}

/** 整张保存里的一行。id 为空 = 新行；带 id = 已有行，整体替换。草稿里图号 / 名称 / 数量都可以空着。 */
export interface LineInput {
    id: string | null
    code: string | null
    name: string | null
    quantity: number | null
    material: string | null
    surfaceTreatment: string | null
    customerRev: string | null
    /** 这一行要删的图纸，随这次保存一起删 */
    removeFileIds: string[]
}

/** 整张订单（2026-11-27：订单页整页编辑，一次保存）。整体替换：没带的已有行会被删掉。 */
export interface SaveOrderInput {
    title: string | null
    /** yyyy-MM-dd；null = 客户没填 */
    wantedDate: string | null
    shipTo: ShipTo | null
    lines: LineInput[]
}

/** 保存后的订单 + 这次新建的行 id（顺序和请求里新行的顺序一致），用来把还没传的图纸对到新行上。 */
export interface SavedOrderView {
    order: OrderView
    createdLineIds: string[]
}

export function listOrders(page = 1, pageSize = 20): Promise<PagedResponse<OrderSummaryView>> {
    return http.get<PagedResponse<OrderSummaryView>>(`/customer/orders?page=${page}&pageSize=${pageSize}`)
}

export function getOrder(orderId: string): Promise<OrderView> {
    return http.get<OrderView>(`/customer/orders/${orderId}`)
}

/** 新建：第一次保存才建单，名称、交期、地址、零件一个事务。 */
export function createOrder(input: SaveOrderInput): Promise<SavedOrderView> {
    return http.post<SavedOrderView>('/customer/orders', input)
}

/** 保存草稿：整张替换，一个事务。不是草稿 409 order.not_draft。 */
export function saveOrder(orderId: string, input: SaveOrderInput): Promise<SavedOrderView> {
    return http.put<SavedOrderView>(`/customer/orders/${orderId}`, input)
}

/**
 * 提交以后单独改收货地址（订单自己的一份，不连地址簿）。就绪 / 已取消 409 order.ship_to_locked。
 * 草稿的地址走整张保存。
 */
export function updateShipTo(orderId: string, shipTo: ShipTo): Promise<OrderView> {
    return http.put<OrderView>(`/customer/orders/${orderId}/ship-to`, shipTo)
}

/**
 * 提交时锁定各行图纸版本。拦截：没有行 409 order.no_lines、公司名没填 400 organization.name_required、
 * 没交期 400 order.wanted_date_required、没地址 400 order.ship_to_required、
 * 行没填齐 400 order.line_incomplete（data = 行 id）、缺图纸 409 order.line_missing_drawing（data = 行 id）。
 */
export function submitOrder(orderId: string): Promise<OrderView> {
    return http.post<OrderView>(`/customer/orders/${orderId}/submit`)
}

/** 只能取消草稿。 */
/** 删除草稿：真删，不可恢复（后端只允许 DRAFT）。 */
export function deleteOrder(orderId: string): Promise<void> {
    return http.delete<void>(`/customer/orders/${orderId}`)
}

/** 在订单里看图：后端校验这一行确实锁的是这个文件的版本，并按订单记审计。 */
/** 预览用：后端签的是 inline URL（不带 attachment），PDF / 图片才会直接在浏览器里显示。 */
export function filePreviewUrl(fileId: string): Promise<ViewUrl> {
    return http.get<ViewUrl>(`/customer/files/${fileId}/preview-url`)
}

export function lineFileViewUrl(orderId: string, lineId: string, fileId: string): Promise<ViewUrl> {
    return http.get<ViewUrl>(`/customer/orders/${orderId}/lines/${lineId}/files/${fileId}/view-url`)
}

/** 确认收货：只有已发货的单能确认，确认后订单完成（409 order.not_shipped）。 */
export function confirmReceipt(orderId: string): Promise<OrderView> {
    return http.post<OrderView>(`/customer/orders/${orderId}/confirm-receipt`)
}

/** 下载随货文件：后端校验归属后签 URL，并记一条审计。 */
export function orderDocumentViewUrl(orderId: string, documentId: string): Promise<ViewUrl> {
    return http.get<ViewUrl>(`/customer/orders/${orderId}/documents/${documentId}/view-url`)
}
