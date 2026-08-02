import { Outlet, useNavigate } from 'react-router-dom'
import { clearSession } from '../auth/session'
import { useSession } from '../auth/useSession'

/**
 * 三端共用的外框。
 *
 * ★ 共用外框、不共用数据。三个端看到的是同一批业务对象的【不同投影】，
 *   而投影是后端的责任 —— 这里只画壳子，不做任何按角色过滤字段的事
 *   （CLAUDE.md 红线 2）。
 */
export function PortalLayout() {
    const session = useSession()
    const navigate = useNavigate()

    function signOut() {
        clearSession()
        navigate('/auth/signin', { replace: true })
    }

    return (
        <div className="layout">
            <header className="layout__header">
                <div className="layout__brand">
                    <strong>MFG</strong>
                    <span className="layout__portal-tag">{session?.partyType}</span>
                </div>
                <div className="layout__user">
                    <span>{session?.displayName}</span>
                    <button type="button" onClick={signOut}>
                        Sign out
                    </button>
                </div>
            </header>
            <main className="layout__main">
                <Outlet />
            </main>
        </div>
    )
}
