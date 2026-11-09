/**
 * 运营端账号管理接口。
 *
 * ★ 全部挂在 /ops/** 下，端级闸门保证只有 OPERATOR 能进。
 * ★ 这里的「删除」是禁用（status=DISABLED），不是物理删除 —— 数据不会消失。
 */

import { http } from '../core/http'
import type { PagedResponse } from '../customer/orders'

// ---------- 外部用户 ----------

export interface AccountView {
    id: string
    orgId: string
    orgName: string | null
    orgType: string | null
    email: string
    displayName: string
    status: string
    locale: string | null
    emailVerifiedAt: string | null
    createdAt: string
}

export interface CreateAccountInput {
    orgId: string
    email: string
    displayName: string
    password: string
    locale?: string | null
}

/** 邮箱与所属公司不可改。 */
export interface UpdateAccountInput {
    displayName?: string
    locale?: string | null
    status?: string
}

export function listAccounts(q = '', page = 1, pageSize = 50): Promise<PagedResponse<AccountView>> {
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (q.trim()) query.set('q', q.trim())
    return http.get<PagedResponse<AccountView>>(`/ops/users?${query}`)
}

export function createAccount(input: CreateAccountInput): Promise<AccountView> {
    return http.post<AccountView>('/ops/users', input)
}

export function updateAccount(id: string, input: UpdateAccountInput): Promise<AccountView> {
    return http.patch<AccountView>(`/ops/users/${id}`, input)
}

export function disableAccount(id: string): Promise<AccountView> {
    return http.delete<AccountView>(`/ops/users/${id}`)
}

// ---------- 组织 ----------

export interface OrganizationAdminView {
    id: string
    type: string
    name: string
    country: string | null
    status: string
    createdAt: string
}

export function listOrganizations(
    q = '', type = '', page = 1, pageSize = 50,
): Promise<PagedResponse<OrganizationAdminView>> {
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (q.trim()) query.set('q', q.trim())
    if (type) query.set('type', type)
    return http.get<PagedResponse<OrganizationAdminView>>(`/ops/organizations?${query}`)
}

export function createOrganization(input: {
    type: string; name: string; country?: string | null
}): Promise<OrganizationAdminView> {
    return http.post<OrganizationAdminView>('/ops/organizations', input)
}

/** 类型不可改。 */
export function updateOrganization(
    id: string, input: { name?: string; country?: string | null; status?: string },
): Promise<OrganizationAdminView> {
    return http.patch<OrganizationAdminView>(`/ops/organizations/${id}`, input)
}

export function disableOrganization(id: string): Promise<OrganizationAdminView> {
    return http.delete<OrganizationAdminView>(`/ops/organizations/${id}`)
}

// ---------- 运营账号 ----------

export interface StaffView {
    id: string
    orgId: string
    orgName: string | null
    email: string
    displayName: string
    status: string
    locale: string | null
    createdAt: string
}

export function listStaff(q = '', page = 1, pageSize = 50): Promise<PagedResponse<StaffView>> {
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (q.trim()) query.set('q', q.trim())
    return http.get<PagedResponse<StaffView>>(`/ops/staff?${query}`)
}

export function createStaff(input: CreateAccountInput): Promise<StaffView> {
    return http.post<StaffView>('/ops/staff', input)
}

export function updateStaff(
    id: string, input: { displayName?: string; locale?: string | null; status?: string },
): Promise<StaffView> {
    return http.patch<StaffView>(`/ops/staff/${id}`, input)
}

export function disableStaff(id: string): Promise<StaffView> {
    return http.delete<StaffView>(`/ops/staff/${id}`)
}
