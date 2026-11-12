/** 客户端：自己公司的信息（后端 ExternalOrgController）。 */

import { http } from '../core/http'

export interface OrganizationView {
    id: string
    name: string
}

export function getMyOrganization(): Promise<OrganizationView> {
    return http.get<OrganizationView>('/customer/organization')
}

/** 补公司名。注册时不收，提交订单前必须补（docs/design/14 §4）。 */
export function renameMyOrganization(name: string): Promise<OrganizationView> {
    return http.patch<OrganizationView>('/customer/organization', { name })
}
