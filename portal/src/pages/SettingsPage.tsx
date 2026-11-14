/**
 * 设置。三端共用同一个页面，挂在各自的路由下。
 *
 * ★ 主题切换用的是两张配色缩略图而不是一个开关：
 *   「{t.misc.light} / {t.misc.dark}」四个字说不清左边那条{t.misc.dark}导航栏在两套主题下都是深的。
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Banner, Card, CardBody, CardFoot, CardHead, Hello, Kv, KvRow, Page } from '../components/ui'
import { Field, Input } from '../components/form'
import { useMock } from '../mock/MockProvider'
import { logout } from '../mock/actions'
import { clearSession, setSession } from '../auth/session'
import { useSession } from '../auth/useSession'
import { logout as apiLogout, updateMyDisplayName } from '../services/auth'
import { errorText } from '../i18n/errorText'
import { getMyOrganization, renameMyOrganization } from '../services/customer/organization'

/**
 * 身份标签。文案复用 t.nav.* —— 顶栏和设置页显示同一件事，
 * 各自写一份早晚会出现两种说法。
 */
const PARTY_BY_TYPE = (t: ReturnType<typeof useMock>['t']) => ({
    CUSTOMER: t.roles.customer,
    SUPPLIER: t.roles.supplier,
    OPERATOR: t.nav.ops.internalOps,
}) as const

export function SettingsPage() {
    const { act, theme, setTheme, t } = useMock()
    const navigate = useNavigate()
    const session = useSession()

    // ★ 公司名：注册时不收（docs/design/14 §4），在这里补。只有客户端有这条路。
    const [company, setCompany] = useState('')
    const [companyOk, setCompanyOk] = useState(false)
    const [companyBusy, setCompanyBusy] = useState(false)
    const [companyErr, setCompanyErr] = useState<string | null>(null)
    const isCustomer = session?.partyType === 'CUSTOMER'

    // 称呼：默认是邮箱前缀（数字邮箱会得到一串数字），在这里可以改。
    // ★ 只在用户没动过输入框时跟随登录态，否则刷新 session 会把正在输入的内容冲掉。
    const [name, setName] = useState('')
    const [nameTouched, setNameTouched] = useState(false)
    const [nameOk, setNameOk] = useState(false)
    const [nameBusy, setNameBusy] = useState(false)
    const [nameErr, setNameErr] = useState<string | null>(null)

    useEffect(() => {
        if (!nameTouched && session?.displayName) setName(session.displayName)
    }, [session?.displayName, nameTouched])

    const saveName = async () => {
        if (!session || nameBusy) return
        const trimmed = name.trim()
        if (!trimmed) return setNameErr(t.errors['common.validation_failed'] ?? t.common.actionFailed)
        setNameBusy(true)
        setNameErr(null)
        setNameOk(false)
        try {
            await updateMyDisplayName(session.partyType, trimmed)
            // 顶栏和「你好，X」都读 session，存下来立刻生效，不用重新登录
            setSession({ ...session, displayName: trimmed })
            setNameOk(true)
        } catch (e) {
            setNameErr(errorText(t, e))
        } finally {
            setNameBusy(false)
        }
    }

    useEffect(() => {
        if (!isCustomer) return
        getMyOrganization()
            .then((o) => setCompany(o.name ?? ''))
            .catch(() => undefined)
    }, [isCustomer])

    const saveCompany = async () => {
        if (!company.trim()) {
            setCompanyErr(t.misc.companyNameHint)
            return
        }
        setCompanyBusy(true)
        setCompanyErr(null)
        try {
            const org = await renameMyOrganization(company.trim())
            setCompany(org.name ?? '')
            setCompanyOk(true)
        } catch (e) {
            setCompanyErr(errorText(t, e, t.common.actionFailed))
        } finally {
            setCompanyBusy(false)
        }
    }

    // ★ 和顶栏用户菜单的退出同一套：撤销后端 refresh token + 清本地登录态。
    //   以前这里只清原型数据仓，真实登录态还在，点了「退出」其实没退出。
    const signOut = () => {
        if (session?.refreshToken) {
            void apiLogout(session.refreshToken).catch(() => undefined)
        }
        clearSession()
        act(logout)
        navigate('/auth/signin', { replace: true })
    }

    return (
        <Page>
            <Hello title={t.misc.settings} />

            <Card style={{ maxWidth: 640 }}>
                <CardHead title={t.misc.appearance} />
                <CardBody>
                    <div className="optrow">
                        <button className={`opt ${theme === 'light' ? 'on' : ''}`} type="button"
                            onClick={() => setTheme('light')}>
                            <span className="sw"><i className="l" /><i className="r" /></span>
                            <span className="on1"><span className="rd" />{t.misc.light}</span>
                        </button>
                        <button className={`opt ${theme === 'dark' ? 'on' : ''}`} type="button"
                            onClick={() => setTheme('dark')}>
                            <span className="sw dk"><i className="l" /><i className="r" /></span>
                            <span className="on1"><span className="rd" />{t.misc.dark}</span>
                        </button>
                    </div>
                </CardBody>
            </Card>

            {isCustomer && (
                <Card style={{ maxWidth: 640, marginTop: 18 }}>
                    <CardHead title={t.misc.companyInfo} />
                    <CardBody>
                        <Field label={t.misc.companyName}>
                            <Input value={company} placeholder={t.misc.companyName}
                                onChange={(v) => { setCompany(v); setCompanyOk(false); setCompanyErr(null) }} />
                        </Field>
                        <div className="fnote" style={{ marginTop: 8 }}>{t.misc.companyNameHint}</div>
                        {companyErr && <Banner tone="wa" style={{ marginTop: 10 }}>{companyErr}</Banner>}
                        {companyOk && <Banner tone="in" style={{ marginTop: 10 }}>{t.misc.companySaved}</Banner>}
                    </CardBody>
                    <CardFoot right={
                        <button className="btn pri" type="button" disabled={companyBusy} onClick={() => void saveCompany()}>
                            {companyBusy ? '…' : t.common.save}
                        </button>
                    } />
                </Card>
            )}

            <Card style={{ maxWidth: 640, marginTop: 18 }}>
                <CardHead title={t.misc.account} />
                <CardBody>
                    {/* 只显示登录态里真有的字段；邮箱、企业名登录态里没有，不显示 */}
                    <Field label={t.misc.name}>
                        <Input value={name} placeholder={t.misc.name}
                            onChange={(v) => { setName(v); setNameTouched(true); setNameOk(false); setNameErr(null) }} />
                    </Field>
                    <div className="fnote" style={{ marginTop: 8 }}>{t.misc.nameHint}</div>
                    {nameErr && <Banner tone="wa" style={{ marginTop: 10 }}>{nameErr}</Banner>}
                    {nameOk && <Banner tone="in" style={{ marginTop: 10 }}>{t.misc.nameSaved}</Banner>}
                    <div style={{ height: 14 }} />
                    <Kv>
                        <KvRow k={t.misc.role} v={session ? PARTY_BY_TYPE(t)[session.partyType] : undefined} sans />
                    </Kv>
                </CardBody>
                <CardFoot left={
                    <button className="btn pri" type="button" disabled={nameBusy} onClick={() => void saveName()}>
                        {nameBusy ? '…' : t.common.save}
                    </button>
                } right={
                    <button className="btn" type="button" onClick={signOut}>
                        {t.nav.signOut}
                    </button>
                } />
            </Card>

        </Page>
    )
}
