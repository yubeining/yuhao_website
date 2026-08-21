/**
 * 受众守卫。
 *
 * ★ 这是体验层，不是安全边界（CLAUDE.md §1）。真正的闸门在后端的
 *   受众级拦截器 —— 前端这层只负责「别把客户甩进内部后台看见一片空白」。
 *   删掉它不会造成越权，只会让走错地址的人看到一个坏页面。
 *
 * ★ 目前读的是原型数据仓的会话（mock/store.ts 的 MockSession）。
 *   后端登录接口做好之后，把 currentRole(state) 换成 auth/useSession.ts 里的
 *   真实登录态即可，判断逻辑不用改 —— 两边都是「当前身份是不是 required」。
 */

import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useMock } from '../mock/MockProvider'
import { currentRole } from '../mock/actions'
import type { RoleName } from '../mock/types'

/** 身份 → 该身份的落地页。走错端时送回自己的地盘，而不是甩到登录页。 */
const HOME: Record<RoleName, string> = {
    customer: '/customer',
    supplier: '/supplier/hall',
    ops: '/ops/dashboard',
}

export function PortalGuard({ required, children }: { required: RoleName; children: ReactNode }) {
    const { state } = useMock()
    const location = useLocation()
    const role = currentRole(state)

    if (!role) {
        // 带上来时的地址，登录后回到这里 —— 直接发链接给同事时不会丢目标页
        return <Navigate to="/auth/signin" replace state={{ from: location.pathname }} />
    }
    if (role.role !== required) {
        return <Navigate to={HOME[role.role]} replace />
    }
    return <>{children}</>
}

/** 已登录的人访问 / 或登录页时，按当前身份送去落地页。 */
export function RootRedirect() {
    const { state } = useMock()
    const role = currentRole(state)
    return <Navigate to={role ? HOME[role.role] : '/auth/signin'} replace />
}
