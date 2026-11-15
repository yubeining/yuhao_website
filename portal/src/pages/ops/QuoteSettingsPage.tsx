/**
 * 报价设置（运营）—— 全局默认报价系数（只读 + 编辑弹框）+ 每个客户公司的系数（只读概览）。
 *
 * ★ 对客价 = 原价 × 汇率 × 报价系数。公司有自己的值就用公司的，否则用这里的默认值。
 * ★ 编辑统一走「只读 → 编辑 → 居中弹框」（2026-11-15 全站统一）：页面上不摆输入框。
 * ★ 单个公司的值在「账号管理 → 组织 → 编辑」里改，这一页只负责看全貌 + 定默认。
 * ★ 默认值存 app_setting 表，改完立刻生效，不用发版。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from '../../components/Modal'
import { Pagination } from '../../components/Pagination'
import { Input } from '../../components/form'
import {
    Banner, Card, CardBody, CardHead, Empty, Hello, Page, TableWrap,
} from '../../components/ui'
import { errorText } from '../../i18n/errorText'
import { useMock } from '../../mock/MockProvider'
import {
    getQuoteSettings, setQuoteDefaultMarkup, type QuoteCompanyRate,
} from '../../services/ops/quotes'

const RATE_RE = /^\d+(\.\d{1,4})?$/
const PAGE_SIZE = 20

export function OpsQuoteSettingsPage() {
    const { t } = useMock()
    const q = t.quoteSettings

    const [defaultRate, setDefaultRate] = useState<number | null>(null)
    const [companies, setCompanies] = useState<QuoteCompanyRate[] | null>(null)
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [err, setErr] = useState<string | null>(null)
    const [flash, setFlash] = useState(false)
    const [busy, setBusy] = useState(false)
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState('')
    const timer = useRef<number | undefined>(undefined)

    const load = useCallback(async (pageNo: number) => {
        try {
            const view = await getQuoteSettings(pageNo, PAGE_SIZE)
            setDefaultRate(view.defaultRate ?? null)
            setCompanies(view.companies.items)
            setTotal(view.companies.total)
            setErr(null)
        } catch (e) {
            setErr(errorText(t, e))
        }
    }, [t])

    useEffect(() => { void load(page) }, [load, page])
    useEffect(() => () => window.clearTimeout(timer.current), [])

    const open = () => {
        setDraft(defaultRate != null ? String(defaultRate) : '')
        setEditing(true)
    }

    const bad = draft.trim() !== '' && (!RATE_RE.test(draft.trim()) || Number(draft.trim()) <= 0)

    const save = async () => {
        if (bad || !draft.trim()) return
        setBusy(true)
        try {
            const saved = await setQuoteDefaultMarkup(Number(draft.trim()))
            setDefaultRate(saved.markupRate)
            setEditing(false)
            setFlash(true)
            window.clearTimeout(timer.current)
            timer.current = window.setTimeout(() => setFlash(false), 2000)
            await load(page)
        } catch (e) {
            setErr(errorText(t, e))
        } finally {
            setBusy(false)
        }
    }

    return (
        <Page>
            <Hello title={q.title} sub={q.sub} />
            {err && <Banner tone="wa" style={{ marginBottom: 14 }}>{err}</Banner>}

            <Card style={{ marginBottom: 16 }}>
                <CardHead title={q.defaultTitle} right={
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                        {flash && <span className="t2" style={{ color: 'var(--ok)' }}>{q.defaultSaved}</span>}
                        <button className="btn sm" type="button" onClick={open}>{t.common.edit}</button>
                    </span>
                } />
                <CardBody>
                    <span className="mono-lg">{defaultRate != null ? `× ${defaultRate}` : q.defaultUnset}</span>
                </CardBody>
            </Card>

            <Card>
                <CardHead title={q.companiesTitle} rid={companies ? q.companyCount(total) : undefined}
                    right={<Link className="linkbtn" to="/ops/accounts/orgs">{q.manageCompanies}</Link>} />
                <CardBody flush>
                    {companies?.length ? (
                        <TableWrap>
                            <thead>
                                <tr><th>{q.colCompany}</th><th className="n">{q.colRate}</th></tr>
                            </thead>
                            <tbody>
                                {companies.map((c) => (
                                    <tr key={c.orgId}>
                                        <td className="t1">{c.name ?? '—'}</td>
                                        <td className="n">
                                            {c.effectiveRate != null ? `× ${c.effectiveRate}` : '—'}
                                            <div className="t2">
                                                {c.markupRate != null ? q.ownValue : q.usingDefault}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    ) : (
                        <Empty text={q.empty} sub={q.emptySub} />
                    )}
                    <Pagination page={page} pageSize={PAGE_SIZE} total={total}
                        onChange={(p) => { setPage(p); void load(p) }} />
                </CardBody>
            </Card>

            {editing && (
                <Modal title={q.defaultTitle} width={320} busy={busy} onClose={() => setEditing(false)}
                    footer={<>
                        <button className="btn" type="button" onClick={() => setEditing(false)}>{t.common.cancel}</button>
                        <button className="btn pri" type="button" disabled={busy || bad || !draft.trim()}
                            onClick={() => void save()}>{t.common.save}</button>
                    </>}>
                    <Input value={draft} style={{ width: 140 }} bad={bad} onChange={setDraft} />
                    <div className="t2" style={{ marginTop: 8 }}>{q.defaultHint}</div>
                </Modal>
            )}
        </Page>
    )
}
