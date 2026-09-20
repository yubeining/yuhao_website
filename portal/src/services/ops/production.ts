/**
 * 运营端：生产进度 + 质检（后端 OpsProductionController，2026-09-20 拍板）。
 *
 * 供应商报开工 / 完工 → 整单发到平台 → 这里按件数判 合格 / 返工 / 报废（三个数之和 = 该行件数）。
 * 报废件本轮只能「原厂重做」：同一家、不加钱，另开一行从头走。
 */

import { http } from '../core/http'
import type { OpsLine, SupplierOrderStatus } from './dispatch'

export interface OpsProductionOrder {
    id: string
    opsOrderId: string
    supplierOrgId: string
    supplierName?: string | null
    status: SupplierOrderStatus
    supplierDueDate: string
    acceptedAt: string
    signedAt?: string | null
    lines: OpsLine[]
}

export function listProduction(): Promise<OpsProductionOrder[]> {
    return http.get<OpsProductionOrder[]>('/ops/production')
}

/** pass + rework + scrap 必须等于该行件数，否则后端 400。 */
export function qcLine(supplierOrderId: string, lineId: string,
                       counts: { pass: number; rework: number; scrap: number }): Promise<OpsProductionOrder> {
    return http.post<OpsProductionOrder>(`/ops/supplier-orders/${supplierOrderId}/lines/${lineId}/qc`, counts)
}

export function remakeLine(supplierOrderId: string, lineId: string): Promise<OpsProductionOrder> {
    return http.post<OpsProductionOrder>(`/ops/supplier-orders/${supplierOrderId}/lines/${lineId}/remake`)
}
