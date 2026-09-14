/** 客户端：自己公司的信息（后端 ExternalOrgController）。 */

import { http } from '../core/http'

export interface OrganizationView {
    id: string
    name: string
}

export function getMyOrganization(): Promise<OrganizationView> {
    return http.get<OrganizationView>('/customer/organization')
}
