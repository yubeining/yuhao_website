/**
 * 受众守卫。
 *
 * ★ 这是体验层,不是安全边界(CLAUDE.md §1)。真正的闸门在后端的受众级拦截器 ——
 *   前端这层只负责「别把客户甩进内部后台看见一片空白」。删掉它不会造成越权。
 *
 * ★ 已接真实登录态(auth/session.ts)。判断逻辑没变 ——「当前身份是不是 required」。
 *   身份来自登录时后端签发、存进 localStorage 的 partyType(不是安全依据,见 session.ts)。
 */

import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useSession } from '../auth/useSession'
import { HOME_BY_TYPE, SIGNIN_BY_TYPE, type PartyType } from '../auth/session'

export function PortalGuard({ required, children }: { required: PartyType; children: ReactNode }) {
    const session = useSession()
    const location = useLocation()

    if (!session) {
        // 未登录 → 去对应受众的登录页(内部走 /auth/internal/signin),带上原地址登录后回来
        return <Navigate to={SIGNIN_BY_TYPE[required]} replace state={{ from: location.pathname }} />
    }
    if (session.partyType !== required) {
        // 走错端 → 送回自己的地盘,而不是甩到登录页
        return <Navigate to={HOME_BY_TYPE[session.partyType]} replace />
    }
    return <>{children}</>
}

/** 已登录的人访问 / 时,按当前身份送去落地页;未登录去外部登录页。 */
export function RootRedirect() {
    const session = useSession()
    return <Navigate to={session ? HOME_BY_TYPE[session.partyType] : '/auth/signin'} replace />
}
