/**
 * 客户自助注册。供应商不走这里 —— 供应商是邀请制（见 InvitePage）。
 */

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BrandSide } from '../../components/brand'
import { BigButton, Checkbox, ErrMsg, Field, FieldRow, Input, Select } from '../../components/form'
import { LangButton } from '../../components/LangButton'
import { useMock } from '../../mock/MockProvider'
import { register } from '../../services/auth'
import { ApiError } from '../../services/core/http'
import { errorText } from '../../i18n/errorText'

/** 国家列表。最后一项是"其他"，文案随语言变，所以在这里拼。 */
const COUNTRIES = ['Germany', 'Austria', 'Switzerland', 'Netherlands']

export function RegisterPage() {
    const { t } = useMock()
    const navigate = useNavigate()
    const c = t.reg
    const countries = [...COUNTRIES, c.otherCountry]

    const [company, setCompany] = useState('')
    const [country, setCountry] = useState(countries[0])
    const [name, setName] = useState('')
    const [mail, setMail] = useState('')
    const [pw, setPw] = useState('')
    const [agree, setAgree] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    const submit = async () => {
        if (busy) return
        if (!company || !mail || !pw) return setErr(c.errRequired)
        if (pw.length < 8) return setErr(c.errPwShort)
        if (!agree) return setErr(c.errAgree)
        setErr(null)
        setBusy(true)
        try {
            // 客户自助注册(供应商是邀请制,不走这里)
            await register({
                portalType: 'CUSTOMER',
                orgName: company,
                country: country === c.otherCountry ? undefined : country,
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

                    <FieldRow>
                        <Field label={c.co}>
                            <Input value={company} onChange={(v) => { setCompany(v); setErr(null) }} placeholder={c.coP} />
                        </Field>
                        <Field label={c.country}>
                            <Select value={country} onChange={setCountry} options={countries} />
                        </Field>
                    </FieldRow>
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
