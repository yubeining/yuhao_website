/**
 * 运营端：供应商邀请（后端 OpsSupplierInviteController）、供应商折率和能力（OpsSupplierController）。
 *
 * 供应商只能运营邀请；链接 7 天有效、用一次失效、可作废（2026-09-18 拍板）。
 * 折率：对供价 = 原价 × 折率，0.8 = 乘 0.8；录好折率才能派单。能力是自由文本。
 */

import { http } from '../core/http'

export type SupplierInviteStatus = 'PENDING' | 'USED' | 'EXPIRED' | 'REVOKED'

export interface SupplierInviteView {
    id: string
    orgName: string
    email: string
    status: SupplierInviteStatus
    expiresAt: string
    usedAt?: string | null
    revokedAt?: string | null
    createdAt: string
    /** 只在刚生成时有，之后再也拿不回来 */
    token?: string | null
}

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

export function createSupplierInvite(orgName: string, email: string): Promise<SupplierInviteView> {
    return http.post<SupplierInviteView>('/ops/supplier-invites', { orgName, email })
}

export function listSupplierInvites(): Promise<SupplierInviteView[]> {
    return http.get<SupplierInviteView[]>('/ops/supplier-invites')
}

export function revokeSupplierInvite(id: string): Promise<SupplierInviteView> {
    return http.post<SupplierInviteView>(`/ops/supplier-invites/${id}/revoke`)
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
