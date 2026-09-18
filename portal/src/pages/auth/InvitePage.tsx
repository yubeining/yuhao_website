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
        if (!orgName.trim() || !name.trim() || !pw) return setErr('请填写公司名称、联系人和密码')
        if (pw.length < 8) return setErr('密码至少 8 位')
        if (pw !== pw2) return setErr('两次输入的密码不一致')
        setErr(null)
        setBusy(true)
        try {
            await registerWithSupplierInvite(token, { orgName: orgName.trim(), displayName: name.trim(), password: pw })
            setPhase('done')
        } catch (e) {
            if (e instanceof ApiError && e.code === 410) setPhase('invalid')
            else setErr(errorText(t, e, '注册失败，请重试'))
        } finally {
            setBusy(false)
        }
    }

    const back = <Link className="btn sm qui" to="/auth/signin">返回登录</Link>

    if (phase === 'loading') {
        return <OnboardShell slim right={back}><div className="t2" style={{ textAlign: 'center' }}>加载中…</div></OnboardShell>
    }
    if (phase === 'invalid') {
        return (
            <OnboardShell slim right={back}>
                <NoticeCard
                    mark="!" tone="wa"
                    title={token ? '邀请链接无效' : '没有有效的邀请'}
                    sub={err ?? (token
                        ? '链接可能已过期（7 天有效）、已被使用或已被作废。请联系融一智造运营重新发一条。'
                        : '平台供应商为邀请制。请用融一智造运营发给你的邀请链接打开这个页面。')}
                    action={<Link className="btn" to="/auth/signin">返回登录</Link>}
                />
            </OnboardShell>
        )
    }
    if (phase === 'done') {
        return (
            <OnboardShell slim>
                <NoticeCard
                    mark="✓" tone="ok"
                    title="注册成功"
                    sub={<>用 <strong>{invite?.email}</strong> 和刚设的密码登录供应商端。<br />
                        平台运营为你设置好合作条件后，才会有订单派给你。</>}
                    action={<Link className="btn pri" to="/auth/signin" style={{ padding: '11px 26px' }}>去登录</Link>}
                />
            </OnboardShell>
        )
    }

    return (
        <OnboardShell slim right={back}>
            <div className="card">
                <div className="cbody" style={{ padding: '28px 26px' }}>
                    <h2 style={{ margin: '0 0 6px' }}>供应商入驻</h2>
                    <div className="t2" style={{ marginBottom: 18 }}>
                        融一智造邀请 <strong>{invite?.orgName}</strong> 成为平台供应商。本链接一次性使用。
                    </div>
                    <Field label="登录邮箱">
                        <div className="m" style={{ padding: '8px 0' }}>{invite?.email}</div>
                        <div className="t2">邮箱由邀请指定，不能修改</div>
                    </Field>
                    <Field label="公司名称"><Input value={orgName} onChange={setOrgName} /></Field>
                    <Field label="联系人姓名"><Input value={name} onChange={setName} placeholder="姓名" /></Field>
                    <Field label="设置密码"><Input type="password" value={pw} onChange={setPw} placeholder="至少 8 位" /></Field>
                    <Field label="再输一次密码"><Input type="password" value={pw2} onChange={setPw2} /></Field>
                    {err && <ErrMsg>{err}</ErrMsg>}
                    <BigButton onClick={() => void submit()}>{busy ? '提交中…' : '创建供应商账号'}</BigButton>
                </div>
            </div>
        </OnboardShell>
    )
}
