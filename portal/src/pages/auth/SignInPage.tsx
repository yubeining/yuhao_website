import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { HOME_BY_TYPE, setSession, type PartyType } from '../../auth/session'
import { devLogin } from '../../services/auth'
import { ApiError } from '../../services/core/http'

const PORTALS: { type: PartyType; label: string; hint: string }[] = [
    { type: 'CUSTOMER', label: '客户端', hint: '欧洲买方 · 邮箱密码登录（未实现）' },
    { type: 'SUPPLIER', label: '供应商端', hint: '中国供应商 · 手机验证码登录（未实现）' },
    { type: 'OPERATOR', label: '内部后台', hint: '我们 · 企微扫码登录（未实现）' },
]

/**
 * 登录页。
 *
 * ★ 现在走的是后端的 dev-login（默认关闭），只为把整条链路跑通：
 *   拿真 JWT → 存 session → PortalGuard 放行 → 调真实接口。
 *
 *   三端真实登录方式各不相同（见 PORTALS 的 hint），做的时候把这个页面
 *   拆成三个入口，而不是在这里塞三套表单。
 */
export function SignInPage() {
    const [params] = useSearchParams()
    const navigate = useNavigate()
    const [error, setError] = useState<string | null>(null)
    const [pending, setPending] = useState<PartyType | null>(null)

    async function signIn(partyType: PartyType) {
        setPending(partyType)
        setError(null)
        try {
            const result = await devLogin(partyType)
            setSession(result)
            const callbackUrl = params.get('callbackUrl')
            navigate(callbackUrl ?? HOME_BY_TYPE[result.partyType], { replace: true })
        } catch (e) {
            // ★ message 是 i18n code 不是文案。真做 i18n 时这里查翻译表。
            const code = e instanceof ApiError ? e.messageCode : 'common.internal_error'
            setError(
                code === 'common.not_found'
                    ? 'dev-login 未启用：后端需要 app.auth.dev-login.enabled=true'
                    : code,
            )
        } finally {
            setPending(null)
        }
    }

    return (
        <div className="signin">
            <div className="signin__card">
                <h1>机加工跨境定制平台</h1>
                <p className="signin__sub">开发登录 —— 选一个端进去</p>

                <div className="signin__portals">
                    {PORTALS.map((p) => (
                        <button
                            key={p.type}
                            type="button"
                            className="signin__portal"
                            disabled={pending !== null}
                            onClick={() => signIn(p.type)}
                        >
                            <span className="signin__portal-label">
                                {p.label}
                                {pending === p.type ? ' …' : ''}
                            </span>
                            <span className="signin__portal-hint">{p.hint}</span>
                        </button>
                    ))}
                </div>

                {error && <p className="signin__error">{error}</p>}
            </div>
        </div>
    )
}
