/**
 * 个人资料。三端共用，挂在各自的前缀下（/customer/profile 等）。
 *
 * ★ 只有昵称可改：邮箱是登录标识（换绑要先证明新旧邮箱都归本人），
 *   身份由组织类型推出，注册时间不可变 —— 这三项置灰展示，不靠文字解释。
 * ★ 保存后写回 session，顶栏的昵称立刻变，不用重新登录。
 */

import { useCallback, useEffect, useState } from 'react'
import { Banner, Card, CardBody, CardFoot, Hello, Page } from '../components/ui'
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
    const [nickname, setNickname] = useState('')
    const [err, setErr] = useState<string | null>(null)
    const [saved, setSaved] = useState(false)
    const [busy, setBusy] = useState(false)

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

    if (!session) return null

    const save = async () => {
        const trimmed = nickname.trim()
        if (!trimmed || busy || trimmed === profile?.nickname) return
        setBusy(true)
        setErr(null)
        setSaved(false)
        try {
            await updateMyNickname(session.partyType, trimmed)
            setProfile((prev) => (prev ? { ...prev, nickname: trimmed } : prev))
            setSession({ ...session, displayName: trimmed })
            setSaved(true)
        } catch (e) {
            setErr(errorText(t, e))
        } finally {
            setBusy(false)
        }
    }

    return (
        <Page>
            <Hello title={p.title} />

            <Card style={{ maxWidth: 720 }}>
                <CardBody>
                    <Field label={p.nickname}>
                        <Input value={nickname} placeholder={p.nickname}
                            onChange={(v) => { setNickname(v); setSaved(false); setErr(null) }} />
                    </Field>

                    <FieldRow>
                        <Field label={p.email}>
                            <Input value={profile?.email ?? ''} onChange={() => undefined} disabled />
                        </Field>
                        <Field label={p.role}>
                            <Input value={PARTY_LABEL(t)[profile?.partyType ?? session.partyType]} onChange={() => undefined} disabled />
                        </Field>
                    </FieldRow>

                    <Field label={p.joined}>
                        <Input value={day(profile?.createdAt ?? '')} onChange={() => undefined} disabled />
                    </Field>

                    {err && <Banner tone="wa" style={{ marginTop: 12 }}>{err}</Banner>}
                    {saved && <Banner tone="ok" style={{ marginTop: 12 }}>{p.saved}</Banner>}
                </CardBody>
                <CardFoot right={
                    <button className="btn pri" type="button" disabled={busy} onClick={() => void save()}>
                        {busy ? '…' : t.common.save}
                    </button>
                } />
            </Card>
        </Page>
    )
}
