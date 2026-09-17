/**
 * 报价工作台 —— 运营看单、看图，逐行填原价（¥/件），选币种、填交期，发给客户。路由参数是订单 id。
 *
 * ★ 对客价 = 原价 × 汇率 × 客户加成率（设计文档 13 §2）。计算全在后端：
 *   「试算」调后端，页面不自己乘 —— 两处各算一遍迟早对不上。
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
    Banner, Card, CardBody, CardFoot, CardHead, Empty, Fields, Fld, Hello, Page, pill, TableWrap,
} from '../../components/ui'
import { errorText } from '../../i18n/errorText'
import { useMock } from '../../mock/MockProvider'
import { fmtDateTime, fmtMoney, M, X } from '../../mock/format'
import {
    ApiError, getCustomerMarkup, getOpsOrder, listOrderQuotes, opsLineFileViewUrl, previewQuote,
    QUOTE_CURRENCIES, sendQuote, setCustomerMarkup,
    type FileView, type MarkupView, type OpsOrderView, type OpsQuoteView, type QuoteCurrency,
    type QuotePreviewView, type SendQuoteInput,
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
    const [preview, setPreview] = useState<QuotePreviewView | null>(null)
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

    const back = <Link className="btn sm qui" to="/ops/quotes" style={{ margin: '0 0 6px -9px' }}>← 报价</Link>

    if (missing) {
        return (
            <Page>
                <Hello back={back} title="报价工作台" />
                <Card><CardBody><Empty text="订单不存在" sub="草稿订单对运营不可见" /></CardBody></Card>
            </Page>
        )
    }
    if (!order) {
        return (
            <Page><Card><CardBody>
                {loadErr
                    ? <Empty text={loadErr} action={<button className="btn" type="button" onClick={() => void load(true)}>重试</button>} />
                    : <Empty text="加载中…" />}
            </CardBody></Card></Page>
        )
    }

    const editable = order.status === 'SUBMITTED' || order.status === 'QUOTED'
    const totalQty = order.lines.reduce((a, l) => a + l.quantity, 0)
    const previewByLine = new Map(preview?.lines.map((l) => [l.lineId, l]) ?? [])

    /** 输入齐了且格式对才返回请求体，否则返回缺什么。 */
    const buildInput = (): SendQuoteInput | string => {
        if (!currency) return '请选择币种'
        const days = Number(lead.trim())
        if (!lead.trim() || !Number.isInteger(days) || days <= 0) return '交期请填正整数天数'
        const lines: SendQuoteInput['lines'] = []
        for (const l of order.lines) {
            const raw = (prices[l.id] ?? '').trim()
            if (!PRICE_RE.test(raw) || Number(raw) <= 0) return `「${l.code}」的原价请填大于 0、最多两位小数的数字`
            lines.push({ lineId: l.id, unitPriceCny: Number(raw) })
        }
        return { currency, leadDays: days, lines }
    }
    const input = buildInput()
    const inputProblem = typeof input === 'string' ? input : null

    const edit = (fn: () => void) => {
        fn()
        setPreview(null)
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
            setPreview(null)
            setOk('加成率已保存，只影响之后发出的报价')
        })
    }

    const doPreview = () => {
        if (typeof input === 'string') return
        void run(async () => setPreview(await previewQuote(order.id, input)))
    }

    const doSend = () => {
        if (typeof input === 'string') return
        const replacing = order.status === 'QUOTED'
        const msg = replacing
            ? '重新发出报价？客户手上待确认的那一版会作废。'
            : '发出报价？客户会看到按最新汇率计算的价格，确认前随汇率变动。'
        if (!window.confirm(msg)) return
        void run(async () => {
            const q = await sendQuote(order.id, input)
            setPreview(null)
            setOk(`第 ${q.versionNo} 版报价已发出`)
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
                title={order.title || '未命名订单'}
                sub={order.customerName ?? X}
                right={pill(ORDER_ST[order.status])}
            />

            {err && <Banner tone="wa" style={{ marginBottom: 14 }}>{err}</Banner>}
            {ok && <Banner tone="ok" style={{ marginBottom: 14 }}>{ok}</Banner>}
            {order.status === 'CONFIRMED' && (
                <Banner tone="ok" style={{ marginBottom: 14 }}>客户已确认报价，价格和汇率已锁定，这一页只读。</Banner>
            )}
            {order.status === 'CANCELLED' && (
                <Banner tone="wa" style={{ marginBottom: 14 }}>订单已取消，不能报价。</Banner>
            )}

            <Card style={{ marginBottom: 16 }}>
                <CardHead title="订单信息" />
                <CardBody>
                    <Fields>
                        <Fld k="客户" v={order.customerName ?? X} />
                        <Fld k="零件数" v={order.lines.length} mono />
                        <Fld k="总件数" v={totalQty} mono />
                        <Fld k="客户期望交期" v={order.wantedLeadDays ? `${order.wantedLeadDays} 天（仅参考）` : X} />
                        <Fld k="提交时间" v={order.submittedAt ? fmtDateTime(new Date(order.submittedAt)) : X} mono />
                    </Fields>
                </CardBody>
            </Card>

            <Card style={{ marginBottom: 16 }}>
                <CardHead title="客户加成率" />
                <CardBody>
                    <Fields>
                        <Fld k="当前" v={markup?.markupRate != null ? `× ${markup.markupRate}` : '未设置'} mono />
                        <Fld k="最后修改" v={markup?.updatedAt ? fmtDateTime(new Date(markup.updatedAt)) : X} mono />
                    </Fields>
                    <div className="fcell" style={{ marginTop: 10 }}>
                        <Input value={markupInput} onChange={(v) => { setMarkupInput(v); setOk(null) }}
                            placeholder="如 1.2" bad={markupBad} style={{ width: 120 }} />
                        <button className="btn" type="button" disabled={busy || markupBad || !markupInput.trim()}
                            onClick={saveMarkup}>保存</button>
                    </div>
                    <div className="t2" style={{ marginTop: 8, lineHeight: 1.6 }}>
                        对客价 = 原价 × 汇率 × 加成率。填 1.2 = 加价 20%，填 0.9 = 九折；大于 0，最多 4 位小数。
                        这是这个客户的值，改了只影响之后发出的报价。
                    </div>
                </CardBody>
            </Card>

            <Card style={{ marginBottom: 16 }}>
                <CardHead title={editable ? (order.status === 'QUOTED' ? '重新报价' : '填报价') : '零件'} />
                <CardBody flush>
                    <TableWrap>
                        <thead>
                            <tr>
                                <th className="n">#</th><th>零件</th><th>材料 / 表面处理</th><th className="n">数量</th>
                                <th>图纸</th><th>原价 ¥/件</th>
                                <th className="n">对客单价</th><th className="n">对客小计</th>
                            </tr>
                        </thead>
                        <tbody>
                            {order.lines.map((l, i) => {
                                const p = previewByLine.get(l.id)
                                const raw = prices[l.id] ?? ''
                                const bad = raw.trim() !== '' && (!PRICE_RE.test(raw.trim()) || Number(raw.trim()) <= 0)
                                return (
                                    <tr key={l.id}>
                                        <td className="n">{i + 1}</td>
                                        <td className="t1">
                                            {l.partName}
                                            <div className="t2 m">{l.code} · v{l.revision.revNo}
                                                {l.revision.customerRev ? ` · 客户标记 ${l.revision.customerRev}` : ''}</div>
                                        </td>
                                        <td>{l.material || X}<div className="t2">{l.surfaceTreatment || X}</div></td>
                                        <td className="n">{l.quantity}</td>
                                        <td>
                                            {l.revision.files.length ? l.revision.files.map((f) => (
                                                <div key={f.id}>
                                                    <button className="btn qui sm" type="button"
                                                        onClick={() => void viewFile(l.id, f)}>{f.originalFilename}</button>
                                                </div>
                                            )) : X}
                                        </td>
                                        <td>
                                            {editable
                                                ? <Input value={raw} bad={bad} placeholder="¥ / 件" style={{ width: 110 }}
                                                    onChange={(v) => edit(() => setPrices((s) => ({ ...s, [l.id]: v })))} />
                                                : X}
                                        </td>
                                        <td className="n">{p ? fmtMoney(p.unitPrice, preview!.currency) : X}</td>
                                        <td className="n">{p ? fmtMoney(p.lineTotal, preview!.currency) : X}</td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </TableWrap>
                </CardBody>
                {editable && (
                    <CardBody>
                        <Fields>
                            <Fld k="对客币种" v={
                                <Select value={currency} options={['', ...QUOTE_CURRENCIES]} style={{ width: 120 }}
                                    onChange={(v) => edit(() => setCurrency(v as QuoteCurrency | ''))} />
                            } />
                            <Fld k="交期（客户确认后）" v={
                                <div className="fcell">
                                    <Input value={lead} placeholder="天" style={{ width: 90 }}
                                        onChange={(v) => edit(() => setLead(v))} />
                                    <span className="t2">天</span>
                                </div>
                            } />
                        </Fields>
                        {preview && (
                            <div className="t2" style={{ marginTop: 10, lineHeight: 1.6 }}>
                                试算：ECB {preview.rateDate} 汇率 1 EUR = {M(preview.fxEurCny, 4)} CNY
                                {preview.currency !== 'EUR' && preview.currency !== 'CNY'
                                    ? ` = ${M(preview.fxEurQuote, 4)} ${preview.currency}` : ''}，
                                加成率 × {preview.markupRate}，合计 <b>{fmtMoney(preview.total, preview.currency)}</b>。
                                客户确认前，价格会随之后的汇率变动。
                            </div>
                        )}
                    </CardBody>
                )}
                {editable && (
                    <CardFoot
                        left={<span className="t2">{inputProblem ?? (markup?.markupRate == null ? '这个客户还没设加成率' : '可以试算或发出')}</span>}
                        right={
                            <>
                                <button className="btn" type="button" onClick={doPreview}
                                    disabled={busy || !!inputProblem}>按当前汇率试算</button>
                                <button className="btn pri" type="button" onClick={doSend}
                                    disabled={busy || !!inputProblem || markup?.markupRate == null}>
                                    {order.status === 'QUOTED' ? '重新发出' : '发出报价'}
                                </button>
                            </>
                        }
                    />
                )}
            </Card>

            <Card>
                <CardHead title="报价记录" rid={`${quotes.length} 版`} />
                {quotes.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th className="n">版本</th><th>状态</th><th>币种</th><th className="n">交期</th>
                                    <th className="n">加成率</th><th className="n">对客总计</th>
                                    <th>汇率</th><th className="n">发出时间</th>
                                </tr>
                            </thead>
                            <tbody>
                                {quotes.map((q) => (
                                    <tr key={q.id}>
                                        <td className="n">v{q.versionNo}</td>
                                        <td>{pill(QUOTE_ST[q.status])}</td>
                                        <td className="m">{q.currency}</td>
                                        <td className="n">{q.leadDays} 天</td>
                                        <td className="n">× {q.markupRate}</td>
                                        <td className="n">{fmtMoney(q.total, q.currency)}</td>
                                        <td className="t2">
                                            {q.rateDate
                                                ? `${q.rateDate}${q.priceLocked ? '（确认时锁定）' : '（最新，未锁定）'}`
                                                : X}
                                        </td>
                                        <td className="n">{fmtDateTime(new Date(q.sentAt))}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                ) : (
                    <CardBody><Empty text="还没有报价" /></CardBody>
                )}
            </Card>
        </Page>
    )
}
