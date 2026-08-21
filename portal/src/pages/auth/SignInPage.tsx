/**
 * 登录。三端共用一个入口 —— 登录后按身份分流，不让用户先选自己是谁。
 */

import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { BrandSide, OAuthIcons } from '../../components/brand'
import { BigButton, ErrMsg, Field, Input } from '../../components/form'
import { LangButton } from '../../components/LangButton'
import { useMock } from '../../mock/MockProvider'
import { currentRole, login } from '../../mock/actions'
import type { RoleName } from '../../mock/types'

const HOME: Record<RoleName, string> = {
    customer: '/customer',
    supplier: '/supplier/hall',
    ops: '/ops/dashboard',
}

export function SignInPage() {
    const { state, actWith, t } = useMock()
    const navigate = useNavigate()
    const location = useLocation()
    const [mail, setMail] = useState('')
    const [pw, setPw] = useState('')
    const [err, setErr] = useState<string | null>(null)
    const c = t.login

    const submit = () => {
        const failure = actWith((s) => login(s, mail, pw))
        if (failure) {
            setErr(failure)
            return
        }
        // 从新状态里读身份决定去哪 —— 客户 / 供应商 / 内部的落地页不同
        const home = actWith((s) => {
            const r = currentRole(s)
            return r ? HOME[r.role] : '/'
        })
        // 被守卫弹回来的人带着原地址，登录后送他回去；跨端的地址不认，避免又被弹一次
        const from = (location.state as { from?: string } | null)?.from
        const prefix = '/' + home.split('/')[1]
        navigate(from && from.startsWith(prefix) ? from : home, { replace: true })
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

                    <div className="inprow">
                        <span style={{ flex: 1 }} />
                        <a href="#">{c.forgot}</a>
                    </div>

                    <BigButton onClick={submit}>{c.submit}</BigButton>

                    <div className="orline"><span>{c.or}</span></div>
                    <div className="oauths">
                        <button className="oauth" type="button">{OAuthIcons.wechat}{c.wx}</button>
                        <button className="oauth" type="button">{OAuthIcons.google}Google</button>
                    </div>

                    {/* 演示账号：填进表单而不是直接跳过登录 —— 跳过的话没人会看见登录页长什么样 */}
                    <div className="demo">
                        <div className="dt">{c.demo}</div>
                        <div className="row">
                            {state.db.users.map((u) => (
                                <button key={u.id} className="acc" type="button"
                                    title={`${u.mail} · 密码 ${u.pw}`}
                                    onClick={() => { setMail(u.mail); setPw(u.pw); setErr(null) }}>
                                    <span className="av">{u.name.slice(-1)}</span>
                                    <span className="a1">
                                        {u.roles.map((r) => t.roles[r.role]).join(' + ')}
                                    </span>
                                </button>
                            ))}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 8, textAlign: 'center' }}>
                            {c.demoHint}
                        </div>
                    </div>

                    <div className="fnote">{c.note}</div>
                    <div className="fnote" style={{ borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 12 }}>
                        {c.invited}<Link to="/auth/invite">{c.invitedA}</Link>
                    </div>
                </div>
            </div>
        </div>
    )
}
