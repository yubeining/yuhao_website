/**
 * 设置。三端共用同一个页面，挂在各自的路由下。
 *
 * ★ 主题切换用的是两张配色缩略图而不是一个开关：
 *   「{t.misc.light} / {t.misc.dark}」四个字说不清左边那条{t.misc.dark}导航栏在两套主题下都是深的。
 */

import { useEffect, useState } from 'react'
import { Banner, Card, CardBody, CardFoot, CardHead, Hello, Page } from '../components/ui'
import { Field, Input } from '../components/form'
import { useMock } from '../mock/MockProvider'
import { useSession } from '../auth/useSession'
import { errorText } from '../i18n/errorText'
import { getMyOrganization, renameMyOrganization } from '../services/customer/organization'

export function SettingsPage() {
    const { theme, setTheme, t } = useMock()
    const session = useSession()

    // ★ 公司名：注册时不收（docs/design/14 §4），在这里补。只有客户端有这条路。
    const [company, setCompany] = useState('')
    const [companyOk, setCompanyOk] = useState(false)
    const [companyBusy, setCompanyBusy] = useState(false)
    const [companyErr, setCompanyErr] = useState<string | null>(null)
    const isCustomer = session?.partyType === 'CUSTOMER'

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

        </Page>
    )
}
