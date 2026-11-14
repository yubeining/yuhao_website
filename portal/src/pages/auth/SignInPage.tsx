/**
 * 外部登录(客户 / 供应商) —— 两条通道，同一个出口：
 *   1) 邮箱 + 密码   → POST /auth/login
 *   2) 邮箱 + 验证码 → POST /auth/otp/send → /auth/otp/verify
 *
 * ★ 是客户还是供应商由后端按账号所属组织推出，不让用户先选自己是谁。
 * ★ 内部(运营)是另一条独立入口 /auth/internal/signin，两个页面不混。
 *
 * ★ 验证码通道目前只有邮箱。手机号要等短信通道落地（后端会把 SMS 明确拒掉，
 *   所以这里不摆一个"手机号"页签 —— 摆出来就是承诺了一个用不了的功能）。
 *
 * ★ 验证通过但邮箱没注册过时，后端返回 registrationRequired 且**不发登录态**。
 *   这里必须当"还没注册"处理，不能当登录成功 —— 建号那一步（填公司信息）还没做。
 */

import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { BrandSide } from '../../components/brand'
import { BigButton, ErrMsg, Field, Input } from '../../components/form'
import { LangButton } from '../../components/LangButton'
import { useMock } from '../../mock/MockProvider'
import { externalLogin, sendOtp, verifyOtp } from '../../services/auth'
import { ApiError } from '../../services/core/http'
import { errorText } from '../../i18n/errorText'
import { HOME_BY_TYPE, setSession, type Session } from '../../auth/session'

type Mode = 'password' | 'code'

export function SignInPage() {
    const { t } = useMock()
    const navigate = useNavigate()
    const location = useLocation()
    const c = t.login

    const [mode, setMode] = useState<Mode>('password')
    const [mail, setMail] = useState('')
    const [pw, setPw] = useState('')
    const [code, setCode] = useState('')
    const [codeSent, setCodeSent] = useState(false)
    /** 重发倒计时（秒）。0 = 可以发。 */
    const [countdown, setCountdown] = useState(0)
    const [err, setErr] = useState<string | null>(null)
    const [needsRegistration, setNeedsRegistration] = useState(false)
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        if (countdown <= 0) return
        const id = window.setTimeout(() => setCountdown((n) => n - 1), 1000)
        return () => window.clearTimeout(id)
    }, [countdown])

    /** 登录成功后的落点：被守卫弹回来的人带着原地址，跨端地址不认（会再被弹一次）。 */
    const finish = (session: Session) => {
        setSession(session)
        const home = HOME_BY_TYPE[session.partyType]
        const from = (location.state as { from?: string } | null)?.from
        const prefix = '/' + home.split('/')[1]
        navigate(from && from.startsWith(prefix) ? from : home, { replace: true })
    }

    const submitPassword = async () => {
        if (busy) return
        setErr(null)
        setBusy(true)
        try {
            const token = await externalLogin(mail.trim(), pw)
            finish({
                accessToken: token.accessToken,
                refreshToken: token.refreshToken,
                partyType: token.portalType,
                displayName: token.displayName,
                locale: token.locale,
            })
        } catch (e) {
            setErr(e instanceof ApiError && e.code === 401 ? t.errors['auth.bad_credentials'] ?? c.h
                : errorText(t, e, c.submit))
        } finally {
            setBusy(false)
        }
    }

    const requestCode = async () => {
        if (busy || countdown > 0) return
        setErr(null)
        setNeedsRegistration(false)
        setBusy(true)
        try {
            await sendOtp('EMAIL', mail.trim())
            setCodeSent(true)
            setCountdown(60)
        } catch (e) {
            setErr(errorText(t, e, t.common.actionFailed))
        } finally {
            setBusy(false)
        }
    }

    const submitCode = async () => {
        if (busy) return
        setErr(null)
        setBusy(true)
        try {
            const result = await verifyOtp('EMAIL', mail.trim(), code.trim())
            if (result.registrationRequired || !result.token) {
                // 邮箱验证过了，但没有账号。不建号 —— 引导去注册（公司信息那一步还没做）
                setNeedsRegistration(true)
                return
            }
            finish({
                accessToken: result.token.accessToken,
                refreshToken: result.token.refreshToken,
                partyType: result.token.portalType,
                displayName: result.token.displayName,
                locale: result.token.locale,
            })
        } catch (e) {
            setErr(errorText(t, e, t.common.actionFailed))
        } finally {
            setBusy(false)
        }
    }

    const backToEmail = () => {
        setCodeSent(false)
        setCode('')
        setCountdown(0)
        setErr(null)
        setNeedsRegistration(false)
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

                    {/* 两种登录方式并列，默认密码（老用户照旧），验证码是新增的 */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                        <button type="button" className={`btn sm${mode === 'password' ? ' pri' : ''}`}
                            onClick={() => { setMode('password'); setErr(null); setNeedsRegistration(false) }}>
                            {c.modePassword}
                        </button>
                        <button type="button" className={`btn sm${mode === 'code' ? ' pri' : ''}`}
                            onClick={() => { setMode('code'); setErr(null) }}>
                            {c.modeCode}
                        </button>
                    </div>

                    {mode === 'password' ? (
                        <>
                            <Field label={c.email}>
                                <Input id="em" type="email" autoComplete="username" placeholder="you@company.com"
                                    value={mail} onChange={(v) => { setMail(v); setErr(null) }} />
                            </Field>
                            <Field label={c.pw}>
                                <Input id="pw" type="password" autoComplete="current-password" placeholder="••••••••"
                                    value={pw} onChange={(v) => { setPw(v); setErr(null) }} />
                            </Field>
                            <ErrMsg>{err}</ErrMsg>
                            <BigButton onClick={submitPassword}>{busy ? '…' : c.submit}</BigButton>
                        </>
                    ) : codeSent ? (
                        <>
                            <Field label={c.codeSentTo}>
                                <div style={{ padding: '10px 0', fontSize: 14 }}>{mail.trim()}</div>
                            </Field>
                            <Field label={c.codeLabel}>
                                <Input id="otp" type="text" autoComplete="one-time-code"
                                    placeholder="123456" value={code}
                                    onChange={(v) => { setCode(v.replace(/\D/g, '').slice(0, 6)); setErr(null) }} />
                            </Field>
                            <ErrMsg>{err}</ErrMsg>
                            {needsRegistration && (
                                <div className="fnote" style={{ marginBottom: 12 }}>
                                    {c.needsRegistration}<Link to="/auth/register">{c.subA}</Link>
                                </div>
                            )}
                            <BigButton onClick={submitCode}>{busy ? '…' : c.submit}</BigButton>
                            <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                                <button type="button" className="btn sm" onClick={backToEmail}>{c.backToEmail}</button>
                                <button type="button" className="btn sm" disabled={countdown > 0 || busy}
                                    onClick={requestCode}>
                                    {countdown > 0 ? c.resendIn(countdown) : c.resend}
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <Field label={c.email}>
                                <Input id="em" type="email" autoComplete="username" placeholder="you@company.com"
                                    value={mail} onChange={(v) => { setMail(v); setErr(null) }} />
                            </Field>
                            <ErrMsg>{err}</ErrMsg>
                            <BigButton onClick={requestCode}>{busy ? '…' : c.sendCode}</BigButton>
                            <div className="fnote" style={{ marginTop: 12 }}>
                                {c.codeHint}
                            </div>
                        </>
                    )}

                    <div className="fnote">{c.note}</div>
                    <div className="fnote" style={{ borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 12 }}>
                        {c.staffPrompt}<Link to="/auth/internal/signin">{c.staffLink}</Link>
                    </div>
                </div>
            </div>
        </div>
    )
}
