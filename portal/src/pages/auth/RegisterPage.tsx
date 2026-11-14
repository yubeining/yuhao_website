/**
 * 客户自助注册 —— 只要邮箱 + 验证码（2026-11-14 改）。
 *
 * ★ 不再收密码、联系人姓名、国家（需求方当天拍板）：
 *   建出来的账号没有密码，以后一律用邮箱验证码登录；显示名取邮箱前缀。
 * ★ 验证码走和登录同一套后端：先 /auth/otp/send 发码，再 /auth/register/otp 校验建号。
 *   码在服务端校验并消费，建号成功直接返回登录态，不用再回登录页走一遍。
 * ★ 供应商不走这里 —— 邀请入口已下线，供应商账号由运营在「账号管理」里建。
 */

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BrandSide } from '../../components/brand'
import { BigButton, Checkbox, ErrMsg, Field, Input } from '../../components/form'
import { LangButton } from '../../components/LangButton'
import { useMock } from '../../mock/MockProvider'
import { registerWithCode, sendOtp } from '../../services/auth'
import { ApiError } from '../../services/core/http'
import { errorText } from '../../i18n/errorText'
import { setSession } from '../../auth/session'

export function RegisterPage() {
    const { t } = useMock()
    const navigate = useNavigate()
    const c = t.reg

    const [mail, setMail] = useState('')
    const [code, setCode] = useState('')
    const [sent, setSent] = useState(false)
    /** 重发倒计时（秒）。0 = 可以发。 */
    const [countdown, setCountdown] = useState(0)
    const [agree, setAgree] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        if (countdown <= 0) return
        const id = window.setTimeout(() => setCountdown((n) => n - 1), 1000)
        return () => window.clearTimeout(id)
    }, [countdown])

    const requestCode = async () => {
        if (busy || countdown > 0) return
        if (!mail.trim()) return setErr(c.errRequired)
        setErr(null)
        setBusy(true)
        try {
            await sendOtp('EMAIL', mail.trim())
            setSent(true)
            setCountdown(60)
        } catch (e) {
            setErr(errorText(t, e, t.common.actionFailed))
        } finally {
            setBusy(false)
        }
    }

    const submit = async () => {
        if (busy) return
        if (!/^\d{6}$/.test(code.trim())) return setErr(c.errCode)
        if (!agree) return setErr(c.errAgree)
        setErr(null)
        setBusy(true)
        try {
            const token = await registerWithCode(mail.trim(), code.trim())
            setSession({
                accessToken: token.accessToken,
                refreshToken: token.refreshToken,
                partyType: token.portalType,
                displayName: token.displayName,
                locale: token.locale,
            })
            navigate('/customer', { replace: true })
        } catch (e) {
            setErr(e instanceof ApiError && e.code === 409 ? c.errTaken
                : errorText(t, e, c.errFailed))
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
                    <div className="fsub">{c.sub}<Link to="/auth/signin">{c.subA}</Link></div>

                    <Field label={c.email}>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <Input type="email" value={mail}
                                onChange={(v) => { setMail(v); setErr(null) }}
                                placeholder="you@company.com" />
                            <button className="btn" type="button" style={{ whiteSpace: 'nowrap' }}
                                disabled={busy || countdown > 0} onClick={() => void requestCode()}>
                                {countdown > 0 ? c.resendIn(countdown) : sent ? c.resend : c.sendCode}
                            </button>
                        </div>
                    </Field>
                    <Field label={c.code}>
                        <Input id="otp" type="text" autoComplete="one-time-code" placeholder={c.codeP}
                            value={code}
                            onChange={(v) => { setCode(v.replace(/\D/g, '').slice(0, 6)); setErr(null) }} />
                    </Field>
                    {sent && <div className="fnote" style={{ marginBottom: 12 }}>{c.codeSentTo(mail.trim())}</div>}

                    <ErrMsg>{err}</ErrMsg>

                    <div className="inprow">
                        <Checkbox checked={agree} onChange={(v) => { setAgree(v); setErr(null) }}>
                            {c.agree}
                        </Checkbox>
                    </div>
                    <BigButton onClick={() => void submit()}>{busy ? '…' : c.submit}</BigButton>
                    <div className="fnote" style={{ marginTop: 12 }}>{c.hint}</div>
                </div>
            </div>
        </div>
    )
}
