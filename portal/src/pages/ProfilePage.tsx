/**
 * 个人资料。三端共用，挂在各自的前缀下（/customer/profile 等）。
 *
 * ★ 两态：查看态只读（文字），点「编辑」才进入编辑态，改完「保存」回查看态。
 *   查看态不用 disabled 输入框表达只读 —— 那是一堆看起来"本来能改"的灰框。
 * ★ 只有昵称可改：邮箱是登录标识（换绑要先证明新旧邮箱都归本人），
 *   身份由组织类型推出，注册时间不可变。
 * ★ 保存后写回 session，顶栏昵称立刻变，不用重新登录。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
    Banner, Card, CardBody, CardFoot, CardHead, Hello, Kv, KvRow, Page,
} from '../components/ui'
import { Field, FieldRow, Input } from '../components/form'
import { useMock } from '../mock/MockProvider'
import { useSession } from '../auth/useSession'
import { setSession } from '../auth/session'
import { getMyProfile, updateMyNickname, type MyProfile } from '../services/auth'
import { errorText } from '../i18n/errorText'

const PARTY_LABEL = (t: ReturnType<typeof useMock>['t']) => ({
    CUSTOMER: t.roles.customer,
    SUPPLIER: t.roles.supplier,
    OPERATOR: t.nav.ops.internalOps,
}) as const

/** 只取日期部分：注册时间不需要时分秒。 */
const day = (iso: string) => (iso ? iso.slice(0, 10) : '—')

export function ProfilePage() {
    const { t } = useMock()
    const session = useSession()
    const p = t.profile

    const [profile, setProfile] = useState<MyProfile | null>(null)
    const [editing, setEditing] = useState(false)
    const [nickname, setNickname] = useState('')
    const [err, setErr] = useState<string | null>(null)
    const [saved, setSaved] = useState(false)
    const [busy, setBusy] = useState(false)
    const nickRef = useRef<HTMLInputElement>(null)

    const load = useCallback(async (partyType: NonNullable<typeof session>['partyType']) => {
        try {
            const data = await getMyProfile(partyType)
            setProfile(data)
            setNickname(data.nickname)
            setErr(null)
        } catch (e) {
            setErr(errorText(t, e))
        }
    }, [t])

    useEffect(() => {
        if (session) void load(session.partyType)
    }, [session, load])

    // 进入编辑态自动聚焦，省一次点击
    useEffect(() => {
        if (editing) nickRef.current?.focus()
    }, [editing])

    // 「已保存」两秒后自己消失，不用点关闭
    useEffect(() => {
        if (!saved) return
        const id = window.setTimeout(() => setSaved(false), 2000)
        return () => window.clearTimeout(id)
    }, [saved])

    if (!session) return null

    const trimmed = nickname.trim()
    const dirty = !!profile && trimmed !== profile.nickname
    const canSave = dirty && !busy

    const startEdit = () => {
        setNickname(profile?.nickname ?? '')
        setErr(null)
        setSaved(false)
        setEditing(true)
    }

    const cancel = () => {
        setNickname(profile?.nickname ?? '')
        setErr(null)
        setEditing(false)
    }

    const save = async () => {
        if (!canSave) return
        setBusy(true)
        setErr(null)
        try {
            await updateMyNickname(session.partyType, trimmed)
            setProfile((prev) => (prev ? { ...prev, nickname: trimmed } : prev))
            setSession({ ...session, displayName: trimmed })
            setEditing(false)
            setSaved(true)
        } catch (e) {
            // 失败留在编辑态，输入不丢
            setErr(errorText(t, e))
        } finally {
            setBusy(false)
        }
    }

    return (
        <Page>
            <Hello title={p.title} />

            <Card style={{ maxWidth: 720 }}>
                <CardHead
                    title={p.basic}
                    right={!editing && (
                        <button className="btn sm" type="button" onClick={startEdit}>{p.edit}</button>
                    )}
                />
                <CardBody>
                    {editing ? (
                        <>
                            <Field label={p.nickname}>
                                <Input id="nickname" value={nickname}
                                    onChange={(v) => { setNickname(v); setErr(null) }} />
                            </Field>
                            <FieldRow>
                                <Field label={p.email}>
                                    <Input value={profile?.email ?? ''} onChange={() => undefined} disabled />
                                </Field>
                                <Field label={p.role}>
                                    <Input value={PARTY_LABEL(t)[profile?.partyType ?? session.partyType]}
                                        onChange={() => undefined} disabled />
                                </Field>
                            </FieldRow>
                            <Field label={p.joined}>
                                <Input value={day(profile?.createdAt ?? '')} onChange={() => undefined} disabled />
                            </Field>
                        </>
                    ) : (
                        <Kv>
                            <KvRow k={p.nickname} v={profile?.nickname ?? '—'} sans />
                            <KvRow k={p.email} v={profile?.email ?? '—'} sans />
                            <KvRow k={p.role} v={PARTY_LABEL(t)[profile?.partyType ?? session.partyType]} sans />
                            <KvRow k={p.joined} v={day(profile?.createdAt ?? '')} />
                        </Kv>
                    )}

                    {err && <Banner tone="wa" style={{ marginTop: 12 }}>{err}</Banner>}
                    {saved && !editing && <Banner tone="ok" style={{ marginTop: 12 }}>{p.saved}</Banner>}
                </CardBody>
                {editing && (
                    <CardFoot
                        left={<button className="btn" type="button" onClick={cancel}>{p.cancel}</button>}
                        right={
                            <button className="btn pri" type="button" disabled={!canSave} onClick={() => void save()}>
                                {busy ? '…' : p.save}
                            </button>
                        }
                    />
                )}
            </Card>
        </Page>
    )
}
