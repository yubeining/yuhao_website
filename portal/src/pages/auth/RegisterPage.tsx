/**
 * 客户自助注册。供应商不走这里 —— 供应商是邀请制（见 InvitePage）。
 */

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BrandSide } from '../../components/brand'
import { BigButton, Checkbox, ErrMsg, Field, FieldRow, Input, Select } from '../../components/form'
import { LangButton } from '../../components/LangButton'
import { useMock } from '../../mock/MockProvider'
import { findUserByMail, signup } from '../../mock/actions'

const COUNTRIES = ['Germany', 'Austria', 'Switzerland', 'Netherlands', '其他']

export function RegisterPage() {
    const { state, act, t } = useMock()
    const navigate = useNavigate()
    const c = t.reg

    const [company, setCompany] = useState('')
    const [country, setCountry] = useState(COUNTRIES[0])
    const [name, setName] = useState('')
    const [mail, setMail] = useState('')
    const [pw, setPw] = useState('')
    const [agree, setAgree] = useState(false)
    const [err, setErr] = useState<string | null>(null)

    const submit = () => {
        if (!company || !mail || !pw) return setErr('请填写公司名称、邮箱和密码')
        if (findUserByMail(state, mail)) return setErr('这个邮箱已经注册过了')
        if (!agree) return setErr('请先同意服务条款与隐私政策')
        act((s) => signup(s, { company, country, name, mail, pw }))
        navigate('/auth/verify')
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
                            <Select value={country} onChange={setCountry} options={COUNTRIES} />
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
