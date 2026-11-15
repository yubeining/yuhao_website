/** 客户端：自己公司的信息（后端 ExternalOrgController）。 */

import { http } from '../core/http'

export interface OrganizationView {
    id: string
    name: string
    /** ISO 3166-1 两位代码；没填为 null */
    country?: string | null
}

export function getMyOrganization(): Promise<OrganizationView> {
    return http.get<OrganizationView>('/customer/organization')
}

/**
 * 改公司资料（名称 + 国家/地区）。
 *
 * ★ country 传 null = 清空；传空串会被后端按"格式不对"拒掉，所以这里统一转成 null。
 */
export function renameMyOrganization(name: string, country?: string | null): Promise<OrganizationView> {
    return http.patch<OrganizationView>('/customer/organization', { name, country: country || null })
}
