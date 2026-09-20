/**
 * 运营端：派单（后端 OpsDispatchController / SupplierPriceController）。
 *
 * 2026-09-18 拍板：一行可拆给几张生产订单，一次拆完（各份之和 = 该行数量）；每张生产订单二选一：
 * 定向派几家 / 挂全市场，先到先得；签字前可收回。对供价 = 原价 × 折率，由后端算。
 */

import { http } from '../core/http'
// 叶子零件行的状态是供应侧的词汇，定义在供应商 service 里，这里只引用，不再定义一份
import type { LineStatus } from '../supplier/offers'

export type OpsOrderStatus = 'ASSEMBLING' | 'OFFERED' | 'PUBLISHED' | 'ASSIGNED' | 'FULFILLED'
export type DispatchMode = 'TARGETED' | 'MARKET'

export interface PoolLine {
    customerOrderPartId: string
    customerOrderId: string
    customerOrgId: string
    customerName?: string | null
    orderTitle?: string | null
    code: string
    partName: string
    quantity: number
    material?: string | null
    surfaceTreatment?: string | null
    submittedAt?: string | null
}

export interface OpsOrderSummary {
    id: string
    status: OpsOrderStatus
    dispatchMode?: DispatchMode | null
    supplierDueDate?: string | null
    dispatchedAt?: string | null
    lineCount: number
    totalQuantity: number
    customerCount: number
    acceptedSupplierName?: string | null
    createdAt: string
}

export interface OpsLine {
    id: string
    customerOrderPartId: string
    customerOrderId: string
    customerOrgId: string
    customerName?: string | null
    orderTitle?: string | null
    code: string
    partName: string
    quantity: number
    material?: string | null
    surfaceTreatment?: string | null
    /** 下面三个只有供应商订单的叶子行才有（生产进度 + 质检拆行的溯源） */
    status?: LineStatus | null
    replacesPartId?: string | null
    supersededBy?: string | null
}


export interface OpsOffer {
    supplierOrgId: string
    supplierName?: string | null
    dispatchRound: number
    status: 'OFFERED' | 'DECLINED' | 'REVOKED'
    respondedAt?: string | null
}

export type SupplierOrderStatus =
    | 'ACCEPTED' | 'CONTRACT_PENDING' | 'CONTRACTED' | 'IN_PRODUCTION' | 'SHIPPED' | 'FULFILLED' | 'CANCELLED'
export type CancelReason = 'WITHDRAWN' | 'REVOKED' | 'SIGN_TIMEOUT'

export interface OpsSupplierOrder {
    id: string
    supplierOrgId: string
    supplierName?: string | null
    status: SupplierOrderStatus
    supplierDueDate: string
    acceptedAt: string
    contractCreatedAt?: string | null
    signedAt?: string | null
    /** 接单 + 7 天；到点没签字系统自动取消 */
    signByDeadline: string
    cancelledAt?: string | null
    cancelReason?: CancelReason | null
}

export interface OpsOrderDetail {
    id: string
    status: OpsOrderStatus
    dispatchMode?: DispatchMode | null
    dispatchRound: number
    supplierDueDate?: string | null
    dispatchedAt?: string | null
    createdAt: string
    lines: OpsLine[]
    offers: OpsOffer[]
    supplierOrders: OpsSupplierOrder[]
}

export interface OpsSupplierPrice {
    supplierOrgId: string
    supplierName: string
    discountRate: number
    total: number
    lines: { opsOrderLineId: string; quantity: number; baseUnitPriceCny: number; unitPriceCny: number; lineTotalCny: number }[]
}

export function dispatchPool(): Promise<PoolLine[]> {
    return http.get<PoolLine[]>('/ops/dispatch/pool')
}

/** 各份数量之和必须等于该行数量。 */
export function allocateLine(customerOrderPartId: string, parts: { opsOrderId: string; quantity: number }[]): Promise<unknown> {
    return http.post('/ops/dispatch/allocate', { customerOrderPartId, parts })
}

/** 整行所有份一起撤。 */
export function unallocateLine(customerOrderPartId: string): Promise<unknown> {
    return http.post('/ops/dispatch/unallocate', { customerOrderPartId })
}

export function listOpsDispatchOrders(status?: OpsOrderStatus): Promise<OpsOrderSummary[]> {
    return http.get<OpsOrderSummary[]>(`/ops/ops-orders${status ? `?status=${status}` : ''}`)
}

export function createOpsDispatchOrder(): Promise<OpsOrderDetail> {
    return http.post<OpsOrderDetail>('/ops/ops-orders')
}

export function getOpsDispatchOrder(id: string): Promise<OpsOrderDetail> {
    return http.get<OpsOrderDetail>(`/ops/ops-orders/${id}`)
}

/** 只能删组装中、一行都没有的。 */
export function deleteOpsDispatchOrder(id: string): Promise<unknown> {
    return http.delete(`/ops/ops-orders/${id}`)
}

export function offerOpsOrder(id: string, supplierOrgIds: string[], supplierDueDate: string): Promise<OpsOrderDetail> {
    return http.post<OpsOrderDetail>(`/ops/ops-orders/${id}/offer`, { supplierOrgIds, supplierDueDate })
}

export function publishOpsOrder(id: string, supplierDueDate: string): Promise<OpsOrderDetail> {
    return http.post<OpsOrderDetail>(`/ops/ops-orders/${id}/publish`, { supplierDueDate })
}

export function recallOpsOrder(id: string): Promise<OpsOrderDetail> {
    return http.post<OpsOrderDetail>(`/ops/ops-orders/${id}/recall`)
}

export function revokeOpsOrderSupplier(id: string): Promise<OpsOrderDetail> {
    return http.post<OpsOrderDetail>(`/ops/ops-orders/${id}/revoke-supplier`)
}

/** 建合同：把供应商订单推到「待签字」。本轮不生成 PDF、不写条款（2026-09-20 拍板）。 */
export function createSupplierContract(supplierOrderId: string): Promise<OpsSupplierOrder> {
    return http.post<OpsSupplierOrder>(`/ops/supplier-orders/${supplierOrderId}/contract`)
}

/** 作废合同：回到「已接单、等合同」，可以重建。签过字的作废不了。 */
export function cancelSupplierContract(supplierOrderId: string): Promise<OpsSupplierOrder> {
    return http.delete<OpsSupplierOrder>(`/ops/supplier-orders/${supplierOrderId}/contract`)
}

/** 每家可派单供应商按当前折率的对供价。 */
export function opsSupplierPrices(id: string): Promise<OpsSupplierPrice[]> {
    return http.get<OpsSupplierPrice[]>(`/ops/ops-orders/${id}/supplier-prices`)
}
