/**
 * 报价设置（运营）—— 全局默认报价系数（可编辑）+ 每个客户公司的系数（只读概览）。
 *
 * ★ 对客价 = 原价 × 汇率 × 报价系数。公司有自己的值就用公司的，否则用这里的默认值。
 * ★ 单个公司的值在「账号管理 → 组织 → 编辑」里改 —— 这一页只负责"看全貌 + 定默认"，
 *   不在这里逐家编辑（2026-11-15 拍板）。
 * ★ 默认值存 app_setting 表，所以这里改完立刻生效，不用发版。
 */

import { useCallback, useEffect, useState } from 'react'
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
    const [draft, setDraft] = useState('')
    const [companies, setCompanies] = useState<QuoteCompanyRate[] | null>(null)
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [err, setErr] = useState<string | null>(null)
    const [ok, setOk] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    const load = useCallback(async (pageNo: number) => {
        try {
            const view = await getQuoteSettings(pageNo, PAGE_SIZE)
            setDefaultRate(view.defaultRate ?? null)
            setDraft(view.defaultRate != null ? String(view.defaultRate) : '')
            setCompanies(view.companies.items)
            setTotal(view.companies.total)
            setErr(null)
        } catch (e) {
            setErr(errorText(t, e))
        }
    }, [t])

    useEffect(() => { void load(page) }, [load, page])

    const bad = draft.trim() !== '' && (!RATE_RE.test(draft.trim()) || Number(draft.trim()) <= 0)
    const dirty = draft.trim() !== '' && Number(draft.trim()) !== defaultRate

    const save = async () => {
        if (bad || !draft.trim()) return
        setBusy(true)
        try {
            const saved = await setQuoteDefaultMarkup(Number(draft.trim()))
            setDefaultRate(saved.markupRate)
            setOk(q.defaultSaved)
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
            {ok && <Banner tone="in" style={{ marginBottom: 14 }}>{ok}</Banner>}

            <Card style={{ marginBottom: 16 }}>
                <CardHead title={q.defaultTitle} />
                <CardBody>
                    <div className="fbar">
                        <div className="ff">
                            <span className="ff-k">{q.defaultTitle}</span>
                            <Input value={draft} style={{ width: 120 }} bad={bad}
                                onChange={(v) => { setDraft(v); setOk(null) }} />
                        </div>
                        <button className="btn pri" type="button" disabled={busy || bad || !draft.trim() || !dirty}
                            onClick={() => void save()}>{t.common.save}</button>
                    </div>
                    <div className="t2" style={{ marginTop: 8 }}>{q.defaultHint}</div>
                </CardBody>
            </Card>

            <Card>
                <CardHead title={q.companiesTitle} rid={companies ? q.companyCount(total) : undefined} />
                <CardBody flush>
                    {companies?.length ? (
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>{q.colCompany}</th><th className="n">{q.colOwn}</th>
                                    <th className="n">{q.colEffective}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {companies.map((c) => (
                                    <tr key={c.orgId}>
                                        <td className="t1">{c.name ?? '—'}</td>
                                        <td className="n">
                                            {c.markupRate != null ? `× ${c.markupRate}` : <span className="t2">{q.useDefault}</span>}
                                        </td>
                                        <td className="n">
                                            {c.effectiveRate != null ? `× ${c.effectiveRate}` : <span className="t2">{q.unset}</span>}
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
        </Page>
    )
}
