/**
 * 供应商邀请落地页 + 注册（2026-09-18：供应商只能运营邀请）。
 *
 * ★ 供应商是邀请制 —— 没有有效邀请就没有入驻入口。链接无效时直接说清楚，
 *   而不是给个注册表单让人填完才发现进不来。
 * ★ 注册只填公司名、联系人、密码；邮箱就是邀请上的那个，不能改（防链接转手）。
 *   开票、银行、执照等资料等合同那一步再收 —— 原型里那张三步长表单（supplier-register）没有接后端。
 * ★ 注册成功后能登录供应商端；运营录好折率之后才会被派单（这里如实说，不承诺时间）。
 */

import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BigButton, ErrMsg, Field, Input } from '../../components/form'
import { errorText } from '../../i18n/errorText'
import { useMock } from '../../mock/MockProvider'
import { checkSupplierInvite, registerWithSupplierInvite, type SupplierInviteCheck } from '../../services/auth'
import { ApiError } from '../../services/core/http'
import { NoticeCard, OnboardShell } from './OnboardShell'

type Phase = 'loading' | 'invalid' | 'form' | 'done'

export function InvitePage() {
    const { t } = useMock()
    const [params] = useSearchParams()
    const token = params.get('token') ?? ''
    const [phase, setPhase] = useState<Phase>(token ? 'loading' : 'invalid')
    const [invite, setInvite] = useState<SupplierInviteCheck | null>(null)
    const [orgName, setOrgName] = useState('')
    const [name, setName] = useState('')
    const [pw, setPw] = useState('')
    const [pw2, setPw2] = useState('')
    const [err, setErr] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        setErr(null)
        if (!token) {
            setPhase('invalid')
            return
        }
        setPhase('loading')
        checkSupplierInvite(token)
            .then((i) => {
                setInvite(i)
                setOrgName(i.orgName)
                setPhase('form')
            })
            .catch((e) => {
                if (e instanceof ApiError && e.code === 410) setPhase('invalid')
                else {
                    setErr(errorText(t, e))
                    setPhase('invalid')
                }
            })
    }, [token, t])

    const submit = async () => {
        if (busy) return
        if (!orgName.trim() || !name.trim() || !pw) return setErr(t.invite.errRequired)
        if (pw.length < 8) return setErr(t.invite.errPwShort)
        if (pw !== pw2) return setErr(t.invite.errPwMismatch)
        setErr(null)
        setBusy(true)
        try {
            await registerWithSupplierInvite(token, { orgName: orgName.trim(), displayName: name.trim(), password: pw })
            setPhase('done')
        } catch (e) {
            if (e instanceof ApiError && e.code === 410) setPhase('invalid')
            else setErr(errorText(t, e, t.invite.errFailed))
        } finally {
            setBusy(false)
        }
    }

    const back = <Link className="btn sm qui" to="/auth/signin">{t.invite.backToSignin}</Link>

    if (phase === 'loading') {
        return <OnboardShell slim right={back}><div className="t2" style={{ textAlign: 'center' }}>{t.invite.loading}</div></OnboardShell>
    }
    if (phase === 'invalid') {
        return (
            <OnboardShell slim right={back}>
                <NoticeCard
                    mark="!" tone="wa"
                    title={token ? t.invite.invalidTitle : t.invite.noInvite}
                    sub={err ?? (token ? t.invite.invalidExpired : t.invite.invalidNone)}
                    action={<Link className="btn" to="/auth/signin">{t.invite.backToSignin}</Link>}
                />
            </OnboardShell>
        )
    }
    if (phase === 'done') {
        return (
            <OnboardShell slim>
                <NoticeCard
                    mark="✓" tone="ok"
                    title={t.invite.successTitle}
                    sub={t.invite.successBody(invite?.email ?? '')}
                    action={<Link className="btn pri" to="/auth/signin" style={{ padding: '11px 26px' }}>{t.invite.goSignin}</Link>}
                />
            </OnboardShell>
        )
    }

    return (
        <OnboardShell slim right={back}>
            <div className="card">
                <div className="cbody" style={{ padding: '28px 26px' }}>
                    <h2 style={{ margin: '0 0 6px' }}>{t.invite.h}</h2>
                    <div className="t2" style={{ marginBottom: 18 }}>
                        {t.invite.intro(invite?.orgName ?? '')}
                    </div>
                    <Field label={t.invite.emailLabel}>
                        <div className="m" style={{ padding: '8px 0' }}>{invite?.email}</div>
                        <div className="t2">{t.invite.emailLocked}</div>
                    </Field>
                    <Field label={t.invite.orgLabel}><Input value={orgName} onChange={setOrgName} /></Field>
                    <Field label={t.invite.nameLabel}><Input value={name} onChange={setName} placeholder={t.invite.nameP} /></Field>
                    <Field label={t.invite.pwLabel}><Input type="password" value={pw} onChange={setPw} placeholder={t.invite.pwP} /></Field>
                    <Field label={t.invite.pw2Label}><Input type="password" value={pw2} onChange={setPw2} /></Field>
                    {err && <ErrMsg>{err}</ErrMsg>}
                    <BigButton onClick={() => void submit()}>{busy ? t.invite.submitting : t.invite.submit}</BigButton>
                </div>
            </div>
        </OnboardShell>
    )
}
