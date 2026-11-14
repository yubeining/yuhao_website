/**
 * 运营端：供应商折率和能力（OpsSupplierController）。
 *
 * 折率：对供价 = 原价 × 折率，0.8 = 乘 0.8；录好折率才能派单。能力是自由文本。
 */

import { http } from '../core/http'

export interface SupplierView {
    orgId: string
    name: string
    status: 'ACTIVE' | 'DISABLED'
    discountRate?: number | null
    processes?: string | null
    materials?: string | null
    sizeRange?: string | null
    precisionGrade?: string | null
    /** 启用中且录了折率 */
    dispatchable: boolean
    createdAt: string
}

export interface CapabilityInput {
    processes: string | null
    materials: string | null
    sizeRange: string | null
    precisionGrade: string | null
}

export function listSuppliers(): Promise<SupplierView[]> {
    return http.get<SupplierView[]>('/ops/suppliers')
}

export function setSupplierDiscount(orgId: string, discountRate: number): Promise<SupplierView> {
    return http.put<SupplierView>(`/ops/suppliers/${orgId}/discount`, { discountRate })
}

/** 整体替换：没填的项会被清空。 */
export function setSupplierCapability(orgId: string, input: CapabilityInput): Promise<SupplierView> {
    return http.put<SupplierView>(`/ops/suppliers/${orgId}/capability`, input)
}
