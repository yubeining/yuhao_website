/**
 * 报价工作台 —— 运营看单、看图，逐行填原价（¥/件），选币种、填交期，发给客户。路由参数是订单 id。
 *
 * ★ 对客价 = 原价 × 汇率 × 客户加成率（设计文档 13 §2）。计算全在后端：
 *   这一页<b>不显示汇率、也不做试算</b>（2026-11-15 拍板）—— 运营只填原价，
 *   汇率在发出那一刻由后端取。少一个按钮，也少一段没人看的计算说明。
 * ★ 汇率在客户确认那一刻才锁（13 §3.1）。发出后、确认前，客户看到的价格随每天汇率变；
 *   历史版本里未确认的那一版，对客价也是按最新汇率现算的，不是发出时的数。
 * ★ 加成率每个客户一个数（13 §2.1），1.2 = 加价 20%；发出时快照进报价，之后改不影响已发出的。
 * ★ 以前这一页是原型（AI 估价是模拟输出、利润率 / 议价空间是编的公式），第 3 步只做人工报价，已全部换掉。
 *   价格护栏（偏离多少提醒）的百分比还没给，这一页不做提醒。
 */

import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Input, Select } from '../../components/form'
import {
    Banner, Card, CardBody, CardFoot, CardHead, Empty, Hello, Page, pill, TableWrap,
} from '../../components/ui'
import { errorText } from '../../i18n/errorText'
import { useMock } from '../../mock/MockProvider'
import { fmtDateTime, fmtMoney, X } from '../../mock/format'
import {
    ApiError, getCustomerMarkup, getOpsOrder, listOrderQuotes, opsLineFileViewUrl,
    QUOTE_CURRENCIES, sendQuote, setCustomerMarkup,
    type FileView, type MarkupView, type OpsOrderView, type OpsQuoteView, type QuoteCurrency,
    type SendQuoteInput,
} from '../../services'
import { ORDER_ST, QUOTE_ST } from '../customer/status'

const PRICE_RE = /^\d+(\.\d{1,2})?$/
const MARKUP_RE = /^\d+(\.\d{1,4})?$/

export function OpsQuoteWorkPage() {
    const { t } = useMock()
    const { id = '' } = useParams()
    const [order, setOrder] = useState<OpsOrderView | null>(null)
    const [quotes, setQuotes] = useState<OpsQuoteView[]>([])
    const [markup, setMarkup] = useState<MarkupView | null>(null)
    const [missing, setMissing] = useState(false)
    const [loadErr, setLoadErr] = useState<string | null>(null)

    const [prices, setPrices] = useState<Record<string, string>>({})
    const [currency, setCurrency] = useState<QuoteCurrency | ''>('')
    const [lead, setLead] = useState('')
    const [markupInput, setMarkupInput] = useState('')
    const [err, setErr] = useState<string | null>(null)
    const [ok, setOk] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    /** prefill = true：用最近一版报价填输入框（首次加载、发出之后）。 */
    const load = useCallback(async (prefill: boolean) => {
        try {
            const o = await getOpsOrder(id)
            const [qs, mk] = await Promise.all([listOrderQuotes(id), getCustomerMarkup(o.customerOrgId)])
            setOrder(o)
            setQuotes(qs)
            setMarkup(mk)
            setMarkupInput(mk.markupRate != null ? String(mk.markupRate) : '')
            if (prefill && qs.length) {
                const latest = qs[0]
                setPrices(Object.fromEntries(latest.lines.map((l) => [l.lineId, String(l.unitPriceCny)])))
                setCurrency(latest.currency)
                setLead(String(latest.leadDays))
            }
            setLoadErr(null)
        } catch (e) {
            if (e instanceof ApiError && (e.code === 404 || e.code === 400)) setMissing(true)
            else setLoadErr(errorText(t, e))
        }
    }, [id, t])

    useEffect(() => { void load(true) }, [load])

    const back = <Link className="btn sm qui" to="/ops/quotes" style={{ margin: '0 0 6px -9px' }}>{t.quoteWork.back}</Link>

    if (missing) {
        return (
            <Page>
                <Hello back={back} title={t.quoteWork.title} />
                <Card><CardBody><Empty text={t.quoteWork.notFound} sub={t.quoteWork.notFoundSub} /></CardBody></Card>
            </Page>
        )
    }
    if (!order) {
        return (
            <Page><Card><CardBody>
                {loadErr
                    ? <Empty text={loadErr} action={<button className="btn" type="button" onClick={() => void load(true)}>{t.common.retry}</button>} />
                    : <Empty text={t.common.loading} />}
            </CardBody></Card></Page>
        )
    }

    const editable = order.status === 'SUBMITTED' || order.status === 'QUOTED'
    const totalQty = order.lines.reduce((a, l) => a + l.quantity, 0)
    // 上一版报价的逐行对客单价：重报时给个参照，没有就显示 —
    const lastByLine = new Map(quotes[0]?.lines.map((l) => [l.lineId, l]) ?? [])

    /** 输入齐了且格式对才返回请求体，否则返回缺什么。 */
    const buildInput = (): SendQuoteInput | string => {
        if (!currency) return t.quoteWork.errCurrency
        const days = Number(lead.trim())
        if (!lead.trim() || !Number.isInteger(days) || days <= 0) return t.quoteWork.errLead
        const lines: SendQuoteInput['lines'] = []
        for (const l of order.lines) {
            const raw = (prices[l.id] ?? '').trim()
            if (!PRICE_RE.test(raw) || Number(raw) <= 0) return t.quoteWork.errPrice(l.code)
            lines.push({ lineId: l.id, unitPriceCny: Number(raw) })
        }
        return { currency, leadDays: days, lines }
    }
    const input = buildInput()
    const inputProblem = typeof input === 'string' ? input : null

    const edit = (fn: () => void) => {
        fn()
        setOk(null)
    }

    const run = async (fn: () => Promise<void>) => {
        setBusy(true)
        try {
            await fn()
            setErr(null)
        } catch (e) {
            setErr(errorText(t, e))
        } finally {
            setBusy(false)
        }
    }

    const markupBad = markupInput.trim() !== '' && (!MARKUP_RE.test(markupInput.trim()) || Number(markupInput.trim()) <= 0)

    const saveMarkup = () => {
        if (markupBad || !markupInput.trim()) return
        void run(async () => {
            setMarkup(await setCustomerMarkup(order.customerOrgId, Number(markupInput.trim())))
            setOk(t.quoteWork.savedMarkup)
        })
    }

    const doSend = () => {
        if (typeof input === 'string') return
        const replacing = order.status === 'QUOTED'
        const msg = replacing
            ? t.quoteWork.confirmResend
            : t.quoteWork.confirmSend
        if (!window.confirm(msg)) return
        void run(async () => {
            const q = await sendQuote(order.id, input)
            setOk(t.quoteWork.sentVersion(q.versionNo))
            await load(false)
        })
    }

    const viewFile = (lineId: string, file: FileView) => run(async () => {
        // 下载链接带 Content-Disposition: attachment，浏览器直接存文件，不会离开本页
        window.location.assign((await opsLineFileViewUrl(order.id, lineId, file.id)).url)
    })

    return (
        <Page>
            <Hello
                back={back}
                title={order.title || t.common.untitledOrder}
                sub={order.customerName ?? X}
                right={pill(ORDER_ST[order.status])}
            />

            {/* 订单上下文压成一行：原来那张「订单信息」卡里的字段全在这里 */}
            <div className="t2" style={{ marginTop: -6, marginBottom: 14 }}>
                {t.quoteWork.context(order.lines.length, totalQty,
                    order.wantedDate || '',
                    order.submittedAt ? fmtDateTime(new Date(order.submittedAt)) : X)}
            </div>

            {err && <Banner tone="wa" style={{ marginBottom: 14 }}>{err}</Banner>}
            {ok && <Banner tone="ok" style={{ marginBottom: 14 }}>{ok}</Banner>}
            {order.status === 'CONFIRMED' && (
                <Banner tone="ok" style={{ marginBottom: 14 }}>{t.quoteWork.lockedBanner}</Banner>
            )}
            {order.status === 'CANCELLED' && (
                <Banner tone="wa" style={{ marginBottom: 14 }}>{t.quoteWork.cancelledBanner}</Banner>
            )}

            <Card style={{ marginBottom: 16 }}>
                <CardHead title={editable ? (order.status === 'QUOTED' ? t.quoteWork.requoteTitle : t.quoteWork.fillQuote) : t.quoteWork.quoteTitle} />
                <CardBody flush>
                    <TableWrap>
                        <thead>
                            <tr>
                                <th className="n">#</th><th>{t.quoteWork.colPart}</th><th>{t.quoteWork.colMaterialSurface}</th>
                                <th className="n">{t.customer.quotes.colQty}</th><th>{t.customer.orderDetail.colDrawing}</th>
                                <th>{t.quoteWork.colBasePrice}</th><th className="n">{t.quoteWork.colUnit}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {order.lines.map((l, i) => {
                                const raw = prices[l.id] ?? ''
                                const bad = raw.trim() !== '' && (!PRICE_RE.test(raw.trim()) || Number(raw.trim()) <= 0)
                                const last = lastByLine.get(l.id)
                                return (
                                    <tr key={l.id}>
                                        <td className="n">{i + 1}</td>
                                        <td className="t1">
                                            {l.partName}
                                            <div className="t2 m">{l.code} · v{l.revision.revNo}
                                                {l.revision.customerRev ? t.quoteWork.customerRev(l.revision.customerRev) : ''}</div>
                                        </td>
                                        <td>{l.material || X} <span className="t2">/ {l.surfaceTreatment || X}</span></td>
                                        <td className="n">{l.quantity}</td>
                                        <td>
                                            {l.revision.files.length ? (
                                                <button className="btn qui sm" type="button"
                                                    onClick={() => void viewFile(l.id, l.revision.files[0])}>
                                                    {l.revision.files.length > 1
                                                        ? t.quoteWork.viewDrawings(l.revision.files.length)
                                                        : t.quoteWork.viewDrawing}
                                                </button>
                                            ) : X}
                                        </td>
                                        <td>
                                            {editable
                                                ? <Input value={raw} bad={bad} placeholder={t.quoteWork.pricePlaceholder} style={{ width: 110 }}
                                                    onChange={(v) => edit(() => setPrices((st) => ({ ...st, [l.id]: v })))} />
                                                : X}
                                        </td>
                                        <td className="n">{last ? fmtMoney(last.unitPrice, quotes[0].currency) : X}</td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </TableWrap>
                </CardBody>

                {editable && (
                    <div className="qset">
                        <span className="lbl">{t.quoteWork.lblMarkup}
                            <Input value={markupInput} style={{ width: 84 }} bad={markupBad}
                                onChange={(v) => { setMarkupInput(v); setOk(null) }} />
                            <span className="tip">{t.quoteWork.markupHint}</span>
                            <button className="linkbtn" type="button"
                                disabled={busy || markupBad || !markupInput.trim()
                                    || markupInput.trim() === String(markup?.markupRate ?? '')}
                                onClick={saveMarkup}>{t.common.save}</button>
                        </span>
                        <span className="lbl">{t.quoteWork.lblCurrency}
                            <Select value={currency} options={['', ...QUOTE_CURRENCIES]} style={{ width: 96 }}
                                onChange={(v) => edit(() => setCurrency(v as QuoteCurrency | ''))} />
                        </span>
                        <span className="lbl">{t.quoteWork.lblLead}
                            <Input value={lead} style={{ width: 72 }}
                                onChange={(v) => edit(() => setLead(v))} />
                            {t.quoteWork.dayUnit}
                        </span>
                    </div>
                )}

                {editable && (
                    <CardFoot
                        left={<span className="t2">{inputProblem ?? (markup?.markupRate == null ? t.quoteWork.needMarkup : '')}</span>}
                        right={
                            <button className="btn pri" type="button" onClick={doSend}
                                disabled={busy || !!inputProblem || markup?.markupRate == null}>
                                {order.status === 'QUOTED' ? t.quoteWork.resendBtn : t.quoteWork.sendBtn}
                            </button>
                        }
                    />
                )}
            </Card>

            {quotes.length > 0 && (
                <Card>
                    <CardHead title={t.quoteWork.historyTitle} rid={t.quoteWork.versionCount(quotes.length)} />
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th className="n">{t.quoteWork.colVersion}</th><th>{t.common.table.status}</th><th>{t.quoteWork.colCurrency}</th><th className="n">{t.quoteWork.colLead}</th>
                                    <th className="n">{t.quoteWork.colMarkup}</th><th className="n">{t.quoteWork.colTotal}</th>
                                    <th>{t.quoteWork.colRate}</th><th className="n">{t.quoteWork.colSentAt}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {quotes.map((q) => (
                                    <tr key={q.id}>
                                        <td className="n">v{q.versionNo}</td>
                                        <td>{pill(QUOTE_ST[q.status])}</td>
                                        <td className="m">{q.currency}</td>
                                        <td className="n">{t.quoteWork.leadDays(q.leadDays)}</td>
                                        <td className="n">{t.quoteWork.markupTimes(q.markupRate)}</td>
                                        <td className="n">{fmtMoney(q.total, q.currency)}</td>
                                        <td className="t2">
                                            {q.rateDate
                                                ? `${q.rateDate}${q.priceLocked ? t.quoteWork.rateLocked : t.quoteWork.rateUnlocked}`
                                                : X}
                                        </td>
                                        <td className="n">{fmtDateTime(new Date(q.sentAt))}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                </Card>
            )}
        </Page>
    )
}
