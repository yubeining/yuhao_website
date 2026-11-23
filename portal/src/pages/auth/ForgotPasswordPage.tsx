/**
 * 忘记密码（客户 / 供应商）—— 2026-11-23 需求方定：
 *   1) 输邮箱 → POST /auth/password/forgot，邮件里收 6 位验证码（5 分钟有效）
 *   2) 输码 + 新密码 → POST /auth/password/reset，成功**直接登录**
 *
 * ★ 第一步的响应对任何邮箱都一样，所以提示只能说"如果已注册会收到"，不能说"已发送到你的邮箱"。
 * ★ 运营登录页不加忘记密码（需求方 2026-11-23），所以这里只有外部入口。
 * ★ 重置后该账号其他设备全部退出，后端负责；这里只管把新登录态存下来。
 */

import { useState } from 'react'
import { useCountdown } from '../../components/useCountdown'
import { Link, useNavigate } from 'react-router-dom'
import { BrandSide } from '../../components/brand'
import { BigButton, ErrMsg, Field, Form, Input } from '../../components/form'
import { LangButton } from '../../components/LangButton'
import { useI18n } from '../../i18n/I18nProvider'
import { forgotPassword, resetPassword } from '../../services/auth'
import { errorText } from '../../i18n/errorText'
import { landingAfterSignIn, setSession } from '../../auth/session'

export function ForgotPasswordPage() {
    const { t } = useI18n()
    const navigate = useNavigate()
    const c = t.forgotPw

    const [mail, setMail] = useState('')
    const [codeSent, setCodeSent] = useState(false)
    const [code, setCode] = useState('')
    const [pw, setPw] = useState('')
    const [pw2, setPw2] = useState('')
    const [countdown, setCountdown] = useCountdown()
    const [err, setErr] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    const requestCode = async () => {
        if (busy || countdown > 0) return
        setErr(null)
        setBusy(true)
        try {
            await forgotPassword(mail.trim())
            setCodeSent(true)
            setCountdown(60)
        } catch (e) {
            setErr(errorText(t, e, t.common.actionFailed))
        } finally {
            setBusy(false)
        }
    }

    const submit = async () => {
        if (busy) return
        if (pw !== pw2) {
            setErr(c.mismatch)
            return
        }
        setErr(null)
        setBusy(true)
        try {
            const token = await resetPassword(mail.trim(), code.trim(), pw)
            setSession({
                accessToken: token.accessToken,
                refreshToken: token.refreshToken,
                partyType: token.portalType,
                displayName: token.displayName,
                locale: token.locale,
            })
            navigate(landingAfterSignIn(token.portalType, null), { replace: true })
        } catch (e) {
            setErr(errorText(t, e, t.common.actionFailed))
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
                        <Link to="/auth/signin">{c.back}</Link>
                    </div>

                    {codeSent ? (
                        <Form onSubmit={() => void submit()}>
                            <div className="fnote" style={{ marginBottom: 12 }}>{c.codeSentHint}</div>
                            <Field label={c.code}>
                                <Input id="otp" type="text" autoComplete="one-time-code"
                                    value={code}
                                    onChange={(v) => { setCode(v.replace(/\D/g, '').slice(0, 6)); setErr(null) }} />
                            </Field>
                            <Field label={c.newPw}>
                                <Input id="npw" type="password" autoComplete="new-password"
                                    value={pw} onChange={(v) => { setPw(v); setErr(null) }} />
                                <div className="fnote" style={{ marginTop: 4 }}>{c.passwordRule}</div>
                            </Field>
                            <Field label={c.confirmPw}>
                                <Input id="npw2" type="password" autoComplete="new-password"
                                    value={pw2} onChange={(v) => { setPw2(v); setErr(null) }} />
                            </Field>
                            <ErrMsg>{err}</ErrMsg>
                            <BigButton type="submit">{busy ? '…' : c.submit}</BigButton>
                            <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                                <button type="button" className="btn sm" disabled={countdown > 0 || busy}
                                    onClick={requestCode}>
                                    {countdown > 0 ? c.resendIn(countdown) : c.resend}
                                </button>
                            </div>
                        </Form>
                    ) : (
                        <Form onSubmit={() => void requestCode()}>
                            <Field label={c.email}>
                                <Input id="em" type="email" autoComplete="username"
                                    value={mail} onChange={(v) => { setMail(v); setErr(null) }} />
                            </Field>
                            <ErrMsg>{err}</ErrMsg>
                            <BigButton type="submit">{busy ? '…' : c.sendCode}</BigButton>
                        </Form>
                    )}
                </div>
            </div>
        </div>
    )
}
