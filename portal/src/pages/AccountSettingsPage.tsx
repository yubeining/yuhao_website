/**
 * 账号设置。三端共用，挂在各自的前缀下（/customer/settings 等）。
 *
 * ★ 个人资料和设置合并成一页（2026-11-15）：原来两页各只有一点内容，
 *   用户得记住"改昵称去哪、换主题去哪"。现在按段分组，以后加通知/安全就往下加。
 * ★ 两态：资料卡查看态只读（文字），点「编辑」才进编辑态。
 *   查看态不用 disabled 输入框表达只读 —— 那是一堆看起来"本来能改"的灰框。
 * ★ 偏好（语言/主题）即时生效，不需要保存按钮。
 * ★ 只有昵称/公司/国家可改：邮箱是登录标识，身份由组织类型推出，注册时间不可变。
 * ★ 保存后写回 session，顶栏昵称立刻变，不用重新登录。
 * ★ 改密码（2026-11-23）：弹框里先发邮件验证码，再输码 + 新密码。成功后所有设备（含当前）
 *   都已被后端退出，这里清登录态跳登录页。卡片上不显示密码状态 —— 验证码注册的账号没有密码，
 *   显示 ****** 就是假内容。
 */

import { fmtDate } from '../mock/format'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    Banner, Card, CardBody, CardHead, Hello, Kv, KvRow, Page,
} from '../components/ui'
import { Field, Input } from '../components/form'
import { Modal } from '../components/Modal'
import { CountrySelect } from '../components/CountrySelect'
import { countryName } from '../i18n/countries'
import { useMock } from '../mock/MockProvider'
import { useI18n } from '../i18n/I18nProvider'
import { useSession } from '../auth/useSession'
import { clearSession, setSession, SIGNIN_BY_TYPE } from '../auth/session'
import {
    changeMyPassword, getMyProfile, sendMyPasswordCode, updateMyNickname, type MyProfile,
} from '../services/auth'
import { getMyOrganization, renameMyOrganization } from '../services/customer/organization'
import { errorText } from '../i18n/errorText'

const PARTY_LABEL = (t: ReturnType<typeof useMock>['t']) => ({
    CUSTOMER: t.roles.customer,
    SUPPLIER: t.roles.supplier,
    OPERATOR: t.nav.ops.internalOps,
}) as const

/** 只取日期部分（本地日期）：注册时间不需要时分秒。 */
const day = (iso: string) => (iso ? fmtDate(new Date(iso)) : '—')

export function AccountSettingsPage() {
    const { t, theme, setTheme } = useMock()
    const { lang, setLang, t: ti } = useI18n()
    const session = useSession()
    const p = t.profile

    const [profile, setProfile] = useState<MyProfile | null>(null)
    const [editing, setEditing] = useState(false)
    const [nickname, setNickname] = useState('')
    const [orgName, setOrgName] = useState('')
    const [savedOrg, setSavedOrg] = useState('')
    const [country, setCountry] = useState('')
    const [savedCountry, setSavedCountry] = useState('')
    const [err, setErr] = useState<string | null>(null)
    const [saved, setSaved] = useState(false)
    const [busy, setBusy] = useState(false)
    const navigate = useNavigate()

    // ---------- 改密码弹框 ----------
    const [pwOpen, setPwOpen] = useState(false)
    const [pwCodeSent, setPwCodeSent] = useState(false)
    const [pwCode, setPwCode] = useState('')
    const [pwNew, setPwNew] = useState('')
    const [pwNew2, setPwNew2] = useState('')
    const [pwErr, setPwErr] = useState<string | null>(null)
    const [pwBusy, setPwBusy] = useState(false)
    const [pwCountdown, setPwCountdown] = useState(0)

    useEffect(() => {
        if (pwCountdown <= 0) return
        const id = window.setTimeout(() => setPwCountdown((n) => n - 1), 1000)
        return () => window.clearTimeout(id)
    }, [pwCountdown])

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

    // 公司名是账号资料的一部分，和个人信息放同一页
    useEffect(() => {
        if (session?.partyType !== 'CUSTOMER') return
        getMyOrganization()
            .then((o) => {
                setOrgName(o.name ?? ''); setSavedOrg(o.name ?? '')
                setCountry(o.country ?? ''); setSavedCountry(o.country ?? '')
            })
            .catch(() => undefined)
    }, [session?.partyType])

    // 「已保存」两秒后自己消失，不用点关闭
    useEffect(() => {
        if (!saved) return
        const id = window.setTimeout(() => setSaved(false), 2000)
        return () => window.clearTimeout(id)
    }, [saved])

    if (!session) return null

    const trimmed = nickname.trim()
    const companyTrimmed = orgName.trim()
    const isCustomer = session?.partyType === 'CUSTOMER'
    const dirty = !!profile && (trimmed !== profile.nickname
        || (isCustomer && (companyTrimmed !== savedOrg || country !== savedCountry)))
    const canSave = dirty && !busy && (!isCustomer || !!companyTrimmed)

    const startEdit = () => {
        setNickname(profile?.nickname ?? '')
        setOrgName(savedOrg)
        setCountry(savedCountry)
        setErr(null)
        setSaved(false)
        setEditing(true)
    }

    const cancel = () => {
        setNickname(profile?.nickname ?? '')
        setOrgName(savedOrg)
        setCountry(savedCountry)
        setErr(null)
        setEditing(false)
    }

    const save = async () => {
        if (!canSave) return
        setBusy(true)
        setErr(null)
        try {
            if (trimmed !== profile?.nickname) {
                await updateMyNickname(session.partyType, trimmed)
                setProfile((prev) => (prev ? { ...prev, nickname: trimmed } : prev))
                setSession({ ...session, displayName: trimmed })
            }
            if (isCustomer && (companyTrimmed !== savedOrg || country !== savedCountry)) {
                await renameMyOrganization(companyTrimmed, country || null)
                setSavedOrg(companyTrimmed)
                setSavedCountry(country)
                // 顶栏提示条据此刷新
                window.dispatchEvent(new Event('org-updated'))
            }
            setEditing(false)
            setSaved(true)
        } catch (e) {
            // 失败留在编辑态，输入不丢
            setErr(errorText(t, e))
        } finally {
            setBusy(false)
        }
    }

    const openPassword = () => {
        setPwCodeSent(false)
        setPwCode('')
        setPwNew('')
        setPwNew2('')
        setPwErr(null)
        setPwOpen(true)
    }

    const sendPasswordCode = async () => {
        if (pwBusy || pwCountdown > 0) return
        setPwErr(null)
        setPwBusy(true)
        try {
            await sendMyPasswordCode(session.partyType)
            setPwCodeSent(true)
            setPwCountdown(60)
        } catch (e) {
            setPwErr(errorText(t, e))
        } finally {
            setPwBusy(false)
        }
    }

    const canChangePassword = pwCodeSent && pwCode.length === 6 && !!pwNew && !!pwNew2 && !pwBusy

    const changePassword = async () => {
        if (!canChangePassword) return
        if (pwNew !== pwNew2) {
            setPwErr(p.mismatch)
            return
        }
        setPwErr(null)
        setPwBusy(true)
        try {
            await changeMyPassword(session.partyType, pwCode, pwNew)
            // 后端已吊销该账号全部会话（含当前设备），本地登录态也要清掉
            const signIn = SIGNIN_BY_TYPE[session.partyType]
            clearSession()
            navigate(signIn, { replace: true })
        } catch (e) {
            setPwErr(errorText(t, e))
            setPwBusy(false)
        }
    }

    return (
        <Page>
            <Hello title={ti.account.title} />

            {/* 资料没加载出来：以前错误只在编辑弹框里显示，页面上只有一排横线，看不出是出错了 */}
            {!profile && err && !editing && (
                <Banner tone="wa" style={{ marginBottom: 14, maxWidth: 720 }}>
                    {err}{' '}
                    <button className="linkbtn" type="button" onClick={() => void load(session.partyType)}>{t.common.retry}</button>
                </Banner>
            )}

            <Card style={{ maxWidth: 720 }}>
                <CardHead
                    title={p.basic}
                    right={<button className="btn sm" type="button" onClick={startEdit}>{p.edit}</button>}
                />
                <CardBody>
                    <Kv>
                        <KvRow k={p.nickname} v={profile?.nickname ?? '—'} sans />
                        {isCustomer && <KvRow k={p.company} v={savedOrg || '—'} sans />}
                        {isCustomer && (
                            <KvRow k={p.country}
                                v={savedCountry ? countryName(savedCountry, lang) : '—'} sans />
                        )}
                        <KvRow k={p.email} v={profile?.email ?? '—'} sans />
                        <KvRow k={p.role} v={PARTY_LABEL(t)[profile?.partyType ?? session.partyType]} sans />
                        <KvRow k={p.joined} v={day(profile?.createdAt ?? '')} />
                    </Kv>
                    {saved && <Banner tone="ok" style={{ marginTop: 12 }}>{p.saved}</Banner>}
                </CardBody>
            </Card>

            {editing && (
                <Modal title={p.basic} width={400} busy={busy} onClose={cancel}
                    footer={<>
                        <button className="btn" type="button" onClick={cancel}>{p.cancel}</button>
                        <button className="btn pri" type="button" disabled={!canSave} onClick={() => void save()}>
                            {busy ? '…' : p.save}
                        </button>
                    </>}>
                    <Field label={p.nickname}>
                        <Input value={nickname} onChange={(v) => { setNickname(v); setErr(null) }} />
                    </Field>
                    {isCustomer && (
                        <Field label={p.company} required>
                            <Input value={orgName} onChange={(v) => { setOrgName(v); setErr(null) }} />
                        </Field>
                    )}
                    {isCustomer && (
                        <Field label={p.country}>
                            <CountrySelect value={country} allowOther={false}
                                onChange={(v) => { setCountry(v); setErr(null) }} />
                        </Field>
                    )}
                    {err && <Banner tone="wa" style={{ marginTop: 12 }}>{err}</Banner>}
                </Modal>
            )}

            <Card style={{ maxWidth: 720, marginTop: 18 }}>
                <CardHead
                    title={p.password}
                    right={<button className="btn sm" type="button" onClick={openPassword}>{p.changePassword}</button>}
                />
                <CardBody>
                    <div className="fnote">{p.passwordHint}</div>
                </CardBody>
            </Card>

            {pwOpen && (
                <Modal title={p.changePassword} width={400} busy={pwBusy} onClose={() => setPwOpen(false)}
                    footer={<>
                        <button className="btn" type="button" onClick={() => setPwOpen(false)}>{p.cancel}</button>
                        <button className="btn pri" type="button" disabled={!canChangePassword}
                            onClick={() => void changePassword()}>
                            {pwBusy ? '…' : p.save}
                        </button>
                    </>}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                        <button className="btn sm" type="button" disabled={pwBusy || pwCountdown > 0}
                            onClick={() => void sendPasswordCode()}>
                            {pwCountdown > 0 ? p.resendIn(pwCountdown) : pwCodeSent ? p.resend : p.sendCode}
                        </button>
                    </div>
                    {pwCodeSent && profile && (
                        <div className="fnote" style={{ marginBottom: 12 }}>
                            {p.codeSentTo(profile.email)}
                        </div>
                    )}
                    <Field label={p.code}>
                        <Input type="text" autoComplete="one-time-code" value={pwCode}
                            onChange={(v) => { setPwCode(v.replace(/\D/g, '').slice(0, 6)); setPwErr(null) }} />
                    </Field>
                    <Field label={p.newPw}>
                        <Input type="password" autoComplete="new-password" value={pwNew}
                            onChange={(v) => { setPwNew(v); setPwErr(null) }} />
                        <div className="fnote" style={{ marginTop: 4 }}>{p.passwordRule}</div>
                    </Field>
                    <Field label={p.confirmPw}>
                        <Input type="password" autoComplete="new-password" value={pwNew2}
                            onChange={(v) => { setPwNew2(v); setPwErr(null) }} />
                    </Field>
                    {pwErr && <Banner tone="wa" style={{ marginTop: 12 }}>{pwErr}</Banner>}
                </Modal>
            )}

            {/* 偏好：点了就生效，不需要保存 */}
            <Card style={{ maxWidth: 720, marginTop: 18 }}>
                <CardHead title={t.account.preferences} />
                <CardBody>
                    <div className="setrow">
                        <span className="k">{t.account.language}</span>
                        <div className="seg">
                            {/* i18n-exempt-start: 语言名用各自的语言写，不翻译（中文 / English） */}
                            <button type="button" className={lang === 'zh' ? 'on' : ''}
                                onClick={() => setLang('zh')}>中文</button>
                            <button type="button" className={lang === 'en' ? 'on' : ''}
                                onClick={() => setLang('en')}>English</button>
                            {/* i18n-exempt-end */}
                        </div>
                    </div>
                    <div className="setrow">
                        <span className="k">{t.misc.appearance}</span>
                        <div className="seg">
                            <button type="button" className={theme === 'light' ? 'on' : ''}
                                onClick={() => setTheme('light')}>{t.misc.light}</button>
                            <button type="button" className={theme === 'dark' ? 'on' : ''}
                                onClick={() => setTheme('dark')}>{t.misc.dark}</button>
                        </div>
                    </div>
                </CardBody>
            </Card>
        </Page>
    )
}
