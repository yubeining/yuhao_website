/**
 * 客户自助注册。供应商不走这里（邀请入口已于 2026-11-14 下线，
 * 现在由运营在「账号管理」里建供应商账号）。
 */

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BrandSide } from '../../components/brand'
import { CountrySelect } from '../../components/CountrySelect'
import { BigButton, Checkbox, ErrMsg, Field, FieldRow, Input } from '../../components/form'
import { LangButton } from '../../components/LangButton'
import { useMock } from '../../mock/MockProvider'
import { register } from '../../services/auth'
import { ApiError } from '../../services/core/http'
import { errorText } from '../../i18n/errorText'
import { OTHER_COUNTRY } from '../../i18n/countries'


export function RegisterPage() {
    const { t } = useMock()
    const navigate = useNavigate()
    const c = t.reg

    // 存 ISO 两位代码（与运营端 organization.country 口径一致）；空 / OTHER 都表示没填
    const [country, setCountry] = useState('')
    const [name, setName] = useState('')
    const [mail, setMail] = useState('')
    const [pw, setPw] = useState('')
    const [agree, setAgree] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    const submit = async () => {
        if (busy) return
        if (!mail || !pw) return setErr(c.errRequired)
        if (pw.length < 8) return setErr(c.errPwShort)
        if (!agree) return setErr(c.errAgree)
        setErr(null)
        setBusy(true)
        try {
            // 客户自助注册(供应商是邀请制,不走这里)
            // 注册阶段不收公司名（docs/design/14 §4）：
            // 公司会被建出来但名字留空，提交订单前在「设置 → 公司信息」里补
            await register({
                portalType: 'CUSTOMER',
                country: country && country !== OTHER_COUNTRY ? country : undefined,
                email: mail.trim(),
                password: pw,
                displayName: name || mail.trim(),
            })
            // 注册与登录解耦:建号成功后回登录页
            navigate('/auth/signin?registered=1', { replace: true })
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

                    {/* ★ 公司名不在这里收（2026-11-12）：注册只建账号，公司名在提交订单前补。
                        理由见 docs/design/14 §4 —— 注册就建公司会让「一家公司多个采购」建不出来。 */}
                    <Field label={c.country}>
                        <CountrySelect value={country} onChange={setCountry} />
                    </Field>
                    <FieldRow>
                        <Field label={c.name}>
                            <Input value={name} onChange={setName} placeholder={c.nameP} />
                        </Field>
                        <Field label={c.email}>
                            <Input type="email" value={mail} onChange={(v) => { setMail(v); setErr(null) }}
                                placeholder="you@company.com" />
                        </Field>
                    </FieldRow>
                    <Field label={c.pw}>
                        <Input type="password" value={pw} onChange={(v) => { setPw(v); setErr(null) }} placeholder={c.pwP} />
                    </Field>

                    <ErrMsg>{err}</ErrMsg>

                    <div className="inprow">
                        <Checkbox checked={agree} onChange={(v) => { setAgree(v); setErr(null) }}>
                            {c.agree}
                        </Checkbox>
                    </div>
                    <BigButton onClick={submit}>{c.submit}</BigButton>
                </div>
            </div>
        </div>
    )
}
