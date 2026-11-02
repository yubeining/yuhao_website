/** 供应商端：自己公司的信息（后端 ExternalOrgController）。 */

import { http } from '../core/http'
// 和后端同一个 record —— 两个端拿到的形状完全一致，共用一份类型，避免两边漂移。
import type { OrganizationView } from '../customer/organization'

/**
 * ★ 名字带 Supplier 前缀：聚合导出（services/index.ts）里和客户端的
 *   `getMyOrganization` 同处一个命名空间，不加前缀会撞名。
 */
export function getMySupplierOrganization(): Promise<OrganizationView> {
    return http.get<OrganizationView>('/supplier/organization')
}
