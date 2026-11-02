/** 运营工作台：只有后端真有来源的计数（见 OpsDashboardController）。 */

import { http } from '../core/http'

export interface OpsDashboardView {
    /** 客户订单已确认（CONFIRMED），等运营组包 */
    pendingAssembly: number
    /** 生产订单草稿（ASSEMBLING），还没挂出去 */
    assembling: number
    /** 已派出 / 已挂单（OFFERED + PUBLISHED），等供应商接单 */
    offered: number
}

export function getOpsDashboard(): Promise<OpsDashboardView> {
    return http.get<OpsDashboardView>('/ops/dashboard')
}
