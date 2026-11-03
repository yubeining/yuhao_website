/**
 * 供应商入驻 —— 运营发邀请（2026-09-18：供应商只能运营邀请）。
 *
 * ★ 邮件还没接：生成链接后由运营自己复制发给对方。链接只在生成的这一刻显示，
 *   库里只存哈希，之后再也拿不回来 —— 所以生成后直接摆在页面上让人复制。
 * ★ 链接 7 天有效、用一次就失效；还没用的可以作废，作废后重新生成即可。
 * ★ 以前这一页有「待考察供应商 → 定级 → 通过」一段，那是原型的流程，需求方没定资质考察这一步，已删掉。
 *   对方注册后，到「交易方」里录折率，录好就能派单。
 */

import { useCallback, useEffect, useState } from 'react'
import { Input } from '../../components/form'
import {
    Banner, Card, CardBody, CardFoot, CardHead, Empty, Hello, Page, pill, TableWrap, type PillSpec,
} from '../../components/ui'
import { errorText } from '../../i18n/errorText'
import { useMock } from '../../mock/MockProvider'
import { fmtDateTime, X } from '../../mock/format'
import {
    createSupplierInvite, listSupplierInvites, revokeSupplierInvite,
    type SupplierInviteStatus, type SupplierInviteView,
} from '../../services'

/** 邀请状态。文案随语言变，所以是函数。 */
const inviteSt = (t: ReturnType<typeof useMock>['t']): Record<SupplierInviteStatus, PillSpec> => ({
    PENDING: ['wa', t.ops.onboarding.stPending],
    USED: ['ok', t.ops.onboarding.stUsed],
    EXPIRED: ['ne', t.ops.onboarding.stExpired],
    REVOKED: ['ba', t.ops.onboarding.stRevoked],
})

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function OpsOnboardingPage() {
    const { t } = useMock()
    const [invites, setInvites] = useState<SupplierInviteView[] | null>(null)
    const [orgName, setOrgName] = useState('')
    const [email, setEmail] = useState('')
    const [link, setLink] = useState<{ email: string; url: string } | null>(null)
    const [err, setErr] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    const load = useCallback(async () => {
        try {
            setInvites(await listSupplierInvites())
        } catch (e) {
            setErr(errorText(t, e))
        }
    }, [t])

    useEffect(() => { void load() }, [load])

    const create = async () => {
        if (!orgName.trim() || !EMAIL_RE.test(email.trim())) return setErr(t.ops.onboarding.errRequired)
        setBusy(true)
        try {
            const created = await createSupplierInvite(orgName.trim(), email.trim())
            setLink({ email: created.email, url: `${location.origin}/auth/invite?token=${created.token}` })
            setOrgName('')
            setEmail('')
            setErr(null)
            await load()
        } catch (e) {
            setErr(errorText(t, e))
        } finally {
            setBusy(false)
        }
    }

    const revoke = async (id: string) => {
        if (!window.confirm(t.ops.onboarding.revokeConfirm)) return
        try {
            await revokeSupplierInvite(id)
            await load()
        } catch (e) {
            setErr(errorText(t, e))
        }
    }

    const copy = async (url: string) => {
        try {
            await navigator.clipboard.writeText(url)
        } catch {
            // 剪贴板被拒就算了，链接就在页面上，可以手动选中复制
        }
    }

    return (
        <Page>
            <Hello title={t.ops.onboarding.title} />
            {err && <Banner tone="wa" style={{ marginBottom: 14 }}>{err}</Banner>}

            <Card style={{ marginBottom: 16 }}>
                <CardHead title={t.ops.onboarding.inviteTitle} />
                <CardBody>
                    <div className="fcell" style={{ gap: 10, flexWrap: 'wrap' }}>
                        <Input value={orgName} onChange={setOrgName} placeholder={t.ops.onboarding.orgPlaceholder} style={{ width: 220 }} />
                        <Input value={email} onChange={setEmail} placeholder={t.ops.onboarding.emailPlaceholder} style={{ width: 240 }} />
                        <button className="btn pri" type="button" disabled={busy} onClick={() => void create()}>
                            {t.ops.onboarding.generate}
                        </button>
                    </div>
                    <div className="t2" style={{ marginTop: 8, lineHeight: 1.6 }}>
                        {t.ops.onboarding.hint}
                    </div>
                    {link && (
                        <Banner tone="ok" style={{ marginTop: 12 }}>
                            {t.ops.onboarding.linkFor(link.email)}
                            <div className="m" style={{ wordBreak: 'break-all', margin: '6px 0' }}>{link.url}</div>
                            <button className="btn sm" type="button" onClick={() => void copy(link.url)}>{t.ops.onboarding.copy}</button>
                        </Banner>
                    )}
                </CardBody>
            </Card>

            <Card>
                <CardHead title={t.ops.onboarding.historyTitle} rid={invites ? t.ops.onboarding.historyCount(invites.length) : undefined} />
                {invites === null ? (
                    <CardBody><Empty text={t.common.loading} /></CardBody>
                ) : invites.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>{t.ops.onboarding.colOrg}</th><th>{t.ops.onboarding.colEmail}</th><th>{t.common.table.status}</th>
                                    <th className="n">{t.ops.onboarding.colCreatedAt}</th><th className="n">{t.ops.onboarding.colExpires}</th><th />
                                </tr>
                            </thead>
                            <tbody>
                                {invites.map((i) => (
                                    <tr key={i.id}>
                                        <td className="t1">{i.orgName}</td>
                                        <td className="m">{i.email}</td>
                                        <td>{pill(inviteSt(t)[i.status])}</td>
                                        <td className="n">{fmtDateTime(new Date(i.createdAt))}</td>
                                        <td className="n">{i.status === 'PENDING' ? fmtDateTime(new Date(i.expiresAt)) : X}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            {i.status === 'PENDING' && (
                                                <button className="btn qui sm" type="button" onClick={() => void revoke(i.id)}>{t.ops.onboarding.revoke}</button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                ) : (
                    <CardBody><Empty text={t.ops.onboarding.empty} /></CardBody>
                )}
                <CardFoot left={<span className="t2">{t.ops.onboarding.afterRegister}</span>} />
            </Card>
        </Page>
    )
}
