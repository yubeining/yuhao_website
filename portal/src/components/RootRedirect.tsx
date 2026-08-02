import { Navigate } from 'react-router-dom'
import { HOME_BY_TYPE } from '../auth/session'
import { useSession } from '../auth/useSession'

/** 根路径 → 按身份送到各自的落地页；没登录就去登录页。 */
export function RootRedirect() {
    const session = useSession()
    if (!session) {
        return <Navigate to="/auth/signin" replace />
    }
    return <Navigate to={HOME_BY_TYPE[session.partyType]} replace />
}
