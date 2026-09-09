/**
 * 内部(运营)登录 —— 独立入口 /auth/internal/signin,接真后端 /auth/internal/login。
 *
 * ★ 和外部登录({@link SignInPage})<b>完全分开的页面和 URL</b>:内部后台不该出现在
 *   客户/供应商的登录页,反之亦然。恒为 OPERATOR,无自助注册(运营账号内部开通)。
 * ★ 内部受众是中文,文案直接中文即可(§6 只约束后端返 code,前端可写文案)。
 */

import { useState } from 'react'
import { BigButton, ErrMsg, Field, Input } from '../../components/form'
import { opsLogin } from '../../services/auth'
import { ApiError } from '../../services/core/http'
import { HOME_BY_TYPE, setSession } from '../../auth/session'
import { useNavigate } from 'react-router-dom'

export function OpsSignInPage() {
    const navigate = useNavigate()
    const [mail, setMail] = useState('')
    const [pw, setPw] = useState('')
    const [err, setErr] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    const submit = async () => {
        if (busy) return
        setErr(null)
        setBusy(true)
        try {
            const token = await opsLogin(mail.trim(), pw)
            setSession({
                accessToken: token.accessToken,
                refreshToken: token.refreshToken,
                partyType: token.portalType,
                displayName: token.displayName,
                locale: token.locale,
            })
            navigate(HOME_BY_TYPE.OPERATOR, { replace: true })
        } catch (e) {
            setErr(e instanceof ApiError && e.code === 401 ? '账号或密码错误'
                : e instanceof ApiError ? e.messageCode : '登录失败,请重试')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="auth solo">
            <div className="formside">
                <div className="formwrap">
                    <div style={{ fontSize: 12, letterSpacing: 2, color: 'var(--faint)', marginBottom: 8 }}>
                        融一智造 · 内部后台
                    </div>
                    <h1 className="fh">运营登录</h1>
                    <div className="fsub" style={{ color: 'var(--faint)' }}>
                        仅限内部员工。账号由管理员开通,不支持自助注册。
                    </div>

                    <Field label="企业邮箱">
                        <Input id="em" type="email" autoComplete="username" placeholder="you@company.com"
                            value={mail} onChange={(v) => { setMail(v); setErr(null) }} />
                    </Field>
                    <Field label="密码">
                        <Input id="pw" type="password" autoComplete="current-password" placeholder="••••••••"
                            value={pw} onChange={(v) => { setPw(v); setErr(null) }} />
                    </Field>
                    <ErrMsg>{err}</ErrMsg>

                    <BigButton onClick={submit}>{busy ? '…' : '登录'}</BigButton>
                </div>
            </div>
        </div>
    )
}
