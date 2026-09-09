/**
 * 外部登录(客户 / 供应商)—— 接真后端 /auth/login。
 *
 * ★ 只凭邮箱 + 密码:是客户还是供应商由后端按账号所属组织推出,不让用户先选自己是谁。
 * ★ 内部(运营)是<b>另一条独立入口</b> /auth/internal/signin(OpsSignInPage),两个页面不混。
 * ★ UI 文案暂仍取自原型的 t(i18n 尚未单独迁移);登录动作已是真实调用。
 */

import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { BrandSide } from '../../components/brand'
import { BigButton, ErrMsg, Field, Input } from '../../components/form'
import { LangButton } from '../../components/LangButton'
import { useMock } from '../../mock/MockProvider'
import { externalLogin } from '../../services/auth'
import { ApiError } from '../../services/core/http'
import { HOME_BY_TYPE, setSession } from '../../auth/session'

export function SignInPage() {
    const { t } = useMock()
    const navigate = useNavigate()
    const location = useLocation()
    const [mail, setMail] = useState('')
    const [pw, setPw] = useState('')
    const [err, setErr] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const c = t.login

    const submit = async () => {
        if (busy) return
        setErr(null)
        setBusy(true)
        try {
            const token = await externalLogin(mail.trim(), pw)
            setSession({
                accessToken: token.accessToken,
                refreshToken: token.refreshToken,
                partyType: token.portalType,
                displayName: token.displayName,
                locale: token.locale,
            })
            const home = HOME_BY_TYPE[token.portalType]
            // 被守卫弹回来的人带着原地址,登录后送他回去;跨端地址不认,避免又被弹一次
            const from = (location.state as { from?: string } | null)?.from
            const prefix = '/' + home.split('/')[1]
            navigate(from && from.startsWith(prefix) ? from : home, { replace: true })
        } catch (e) {
            setErr(e instanceof ApiError && e.code === 401 ? '账号或密码错误'
                : e instanceof ApiError ? e.messageCode : '登录失败,请重试')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="auth">
            <BrandSide flow={t.flow} />
            <div className="formside">
                <LangButton />
                <div className="formwrap">
                    <h1 className="fh">{c.h}</h1>
                    <div className="fsub">
                        {c.sub}<Link to="/auth/register">{c.subA}</Link>
                    </div>

                    <Field label={c.email}>
                        <Input id="em" type="email" autoComplete="username" placeholder="you@company.com"
                            value={mail} onChange={(v) => { setMail(v); setErr(null) }} />
                    </Field>
                    <Field label={c.pw}>
                        <Input id="pw" type="password" autoComplete="current-password" placeholder="••••••••"
                            value={pw} onChange={(v) => { setPw(v); setErr(null) }} />
                    </Field>
                    <ErrMsg>{err}</ErrMsg>

                    {/* ★「忘记密码」已删：href="#"，后端没有重置端点。
                        被锁在外面的人正是最会点它的人，点了没反应比没有更糟。 */}

                    <BigButton onClick={submit}>{busy ? '…' : c.submit}</BigButton>

                    {/* ★ 微信 / Google 登录按钮已删（2026-09-09）。
                        两个按钮都没有 onClick，后端也没有任何 OAuth 端点 ——
                        它们既点不动，又向用户承诺了平台支持第三方登录。
                        真做 OAuth 的时候再加回来，连着后端一起加。 */}

                    <div className="fnote">{c.note}</div>
                    <div className="fnote" style={{ borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 12 }}>
                        {c.invited}<Link to="/auth/invite">{c.invitedA}</Link>
                    </div>
                    <div className="fnote" style={{ marginTop: 8 }}>
                        内部员工?<Link to="/auth/internal/signin"> 从这里登录</Link>
                    </div>
                </div>
            </div>
        </div>
    )
}
