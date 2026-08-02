/**
 * 登录态存储。替代原来的 next-auth。
 *
 * ★★ 这里存的东西【不是】安全边界，只是「免得每次都要重新登录」。
 *
 *   partyType 存在本地是为了让路由知道该把人送去哪个端 —— 它是【体验】。
 *   真正判断「你能不能进这个端」的是后端 PortalGuardInterceptor，
 *   它只信 JWT 里的 ptype，不信任何请求参数。
 *
 *   把 localStorage 里的 partyType 从 CUSTOMER 改成 OPERATOR，
 *   结果只是前端把你送到 /ops/dashboard，然后每个接口都返回 403。
 *
 * ★ 为什么用 localStorage 而不是 httpOnly cookie
 *
 *   httpOnly cookie 能挡 XSS 偷 token，是更安全的方案 —— 但它要求后端下发
 *   Set-Cookie 并处理 CSRF，而当前后端是纯 JWT + 无状态 + csrf disabled。
 *   只改前端不改后端就换存储，会得到一个「看起来更安全但两边对不上」的中间态。
 *
 *   ★ 上线前必须重新评估这个取舍。图纸是客户的知识产权，
 *     token 被 XSS 偷走的后果不是「某个账号被盗」，是保密协议违约。
 *     换 cookie 时后端要同步加 CSRF token，两件事必须同一个 PR 做完。
 */

export type PartyType = 'CUSTOMER' | 'SUPPLIER' | 'OPERATOR'

export interface Session {
    accessToken: string
    partyType: PartyType
    displayName: string
    locale: string
}

const STORAGE_KEY = 'mfg.session'

/** 登录态变化时通知路由重渲染。同一个标签页内 storage 事件不会触发，所以自己发一个。 */
const SESSION_EVENT = 'mfg.session.changed'

export function getSession(): Session | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw) as Session
        // 结构变过（发过版）的旧数据当作没登录，而不是让它带着缺字段流进 UI
        if (!parsed.accessToken || !parsed.partyType) {
            localStorage.removeItem(STORAGE_KEY)
            return null
        }
        return parsed
    } catch {
        localStorage.removeItem(STORAGE_KEY)
        return null
    }
}

export function setSession(session: Session): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    window.dispatchEvent(new Event(SESSION_EVENT))
}

export function clearSession(): void {
    localStorage.removeItem(STORAGE_KEY)
    window.dispatchEvent(new Event(SESSION_EVENT))
}

/** 订阅登录态变化。返回取消订阅函数。 */
export function subscribeSession(listener: () => void): () => void {
    window.addEventListener(SESSION_EVENT, listener)
    // 多标签页同步：别的标签页登出了，这个标签页也要跟着变
    window.addEventListener('storage', listener)
    return () => {
        window.removeEventListener(SESSION_EVENT, listener)
        window.removeEventListener('storage', listener)
    }
}

/** 各 principal type 的落地页。 */
export const HOME_BY_TYPE: Record<PartyType, string> = {
    CUSTOMER: '/customer/rfqs',
    SUPPLIER: '/supplier/quotes',
    OPERATOR: '/ops/dashboard',
}
