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
import { useI18n } from '../../i18n/I18nProvider'
import { errorText } from '../../i18n/errorText'

export function OpsSignInPage() {
    const { t } = useI18n()
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
            setErr(e instanceof ApiError && e.code === 401 ? t.opsLogin.badCredentials
                : errorText(t, e, t.opsLogin.failed))
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="auth solo">
            <div className="formside">
                <div className="formwrap">
                    <div style={{ fontSize: 12, letterSpacing: 2, color: 'var(--faint)', marginBottom: 8 }}>
                        {t.opsLogin.brand}
                    </div>
                    <h1 className="fh">{t.opsLogin.h}</h1>
                    <div className="fsub" style={{ color: 'var(--faint)' }}>
                        {t.opsLogin.sub}
                    </div>

                    <Field label={t.opsLogin.email}>
                        <Input id="em" type="email" autoComplete="username" placeholder="you@company.com"
                            value={mail} onChange={(v) => { setMail(v); setErr(null) }} />
                    </Field>
                    <Field label={t.opsLogin.pw}>
                        <Input id="pw" type="password" autoComplete="current-password" placeholder="••••••••"
                            value={pw} onChange={(v) => { setPw(v); setErr(null) }} />
                    </Field>
                    <ErrMsg>{err}</ErrMsg>

                    <BigButton onClick={submit}>{busy ? '…' : t.opsLogin.submit}</BigButton>
                </div>
            </div>
        </div>
    )
}
