import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { HOME_BY_TYPE, type PartyType } from '../auth/session'
import { useSession } from '../auth/useSession'

/**
 * 端级路由闸门（前端侧）。原 Next.js middleware.ts 的等价物。
 *
 * ★★ 重要：这是【用户体验】层，不是安全边界。
 *
 *   真正的安全边界在后端的 PortalGuardInterceptor —— 按 URL 路径前缀
 *   拒绝错误的 principal type。前端这一层只是为了让走错门的人看到
 *   一个像样的跳转，而不是一屏 403。
 *
 *   永远不要因为"前端已经拦了"就放松后端的校验。
 *   浏览器里的一切都是可绕过的 —— localStorage 里的 partyType 改一改，
 *   这个组件就会把你放进 /ops，然后每个接口返回 403。这正是预期行为。
 *
 * ★ 同样重要：前端代码里【禁止】出现"根据角色隐藏字段"的逻辑。
 *   供应商端拿到的 JSON 里从一开始就不该有客户名和对客价 ——
 *   那是后端 DTO 白名单序列化的责任（CLAUDE.md 红线 2）。
 *   靠前端隐藏 = 数据已经发到浏览器了，F12 就能看到。
 */
export function PortalGuard({ required, children }: { required: PartyType; children: ReactNode }) {
    const session = useSession()
    const location = useLocation()

    if (!session) {
        // 带上 callbackUrl，登录后回到原来想去的地方
        const callbackUrl = location.pathname + location.search
        return <Navigate to={`/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`} replace />
    }

    if (session.partyType !== required) {
        // 走错门 → 送回自己的门，而不是给一屏 403
        return <Navigate to={HOME_BY_TYPE[session.partyType]} replace />
    }

    return <>{children}</>
}
