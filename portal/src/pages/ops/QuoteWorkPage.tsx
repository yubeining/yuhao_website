/**
 * 报价工作台 —— 运营看单、看图，逐行填原价（¥/件），选币种、确认承诺交期，发给客户。路由参数是订单 id。
 *
 * ★ 对客价 = 原价 × 汇率 × 客户加成率（设计文档 13 §2）。计算全在后端：
 *   这一页<b>不显示汇率、也不做试算</b>（2026-11-15 拍板）—— 运营只填原价，
 *   汇率在发出那一刻由后端取。少一个按钮，也少一段没人看的计算说明。
 * ★ 汇率在客户确认那一刻才锁（13 §3.1）。发出后、确认前，客户看到的价格随每天汇率变；
 *   历史版本里未确认的那一版，对客价也是按最新汇率现算的，不是发出时的数。
 * ★ 报价系数（2026-11-15 改名）是客户级配置：公司有自己的用公司的，没有用「报价设置」里的全局默认；
 *   这一页只只读展示生效值，不再就地编辑。发出时快照进报价，之后改不影响已发出的。
 * ★ 交期从「确认后天数」改成「承诺日期」：默认取客户的期望交期，运营可改，客户确认即接受该日期。
 * ★ 以前这一页是原型（AI 估价是模拟输出、利润率 / 议价空间是编的公式），第 3 步只做人工报价，已全部换掉。
 *   价格护栏（偏离多少提醒）的百分比还没给，这一页不做提醒。
 * ★ 2026-11-17 加了真的「AI 成本估算」（EstimateCard）：只给参考成本，不自动填原价。
 * ★ 2026-11-24 发货（ShippingCard）：全部完工之后在这一页把整单发给客户、传随货文件 —— 运营没有单独的订单详情页，
 *   看单、报价、发货都在这里。
 */

import { useCallback, useEffect, useState } from 'react'
import { useBusy } from '../../components/useBusy'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Input, Select } from '../../components/form'
import { DatePicker } from '../../components/DatePicker'
import { FilePreviewModal, previewKindOf, type PreviewKind } from '../../components/FilePreviewModal'
import {
    Banner, Card, CardBody, CardFoot, CardHead, Empty, Hello, Page, pill, TableWrap,
} from '../../components/ui'
import { errorText } from '../../i18n/errorText'
import { useI18n } from '../../i18n/I18nProvider'
import { fmtDateTime, fmtMoney, X } from '../../lib/format'
import {
    ApiError, getCustomerMarkup, getOpsOrder, listOrderQuotes, opsLineFileViewUrl,
    opsLineFilePreviewUrl, QUOTE_CURRENCIES, sendQuote,
    type FileView, type MarkupView, type OpsOrderView, type OpsQuoteView, type QuoteCurrency,
    type SendQuoteInput,
} from '../../services'
import { orderSt, quoteSt } from '../customer/status'
import { useConfirm } from '../../components/ConfirmDialog'
import { EstimateCard } from './EstimateCard'
import { ShipToCard } from '../../components/ShipToCard'
import { ShippingCard } from './ShippingCard'

const PRICE_RE = /^\d+(\.\d{1,2})?$/

export function OpsQuoteWorkPage() {
    const { t } = useI18n()
    const location = useLocation()
    const navigate = useNavigate()
    const [askConfirm, confirmDialog] = useConfirm()
    const { id = '' } = useParams()
    const [order, setOrder] = useState<OpsOrderView | null>(null)
    const [quotes, setQuotes] = useState<OpsQuoteView[]>([])
    const [markup, setMarkup] = useState<MarkupView | null>(null)
    const [missing, setMissing] = useState(false)
    const [loadErr, setLoadErr] = useState<string | null>(null)

    const [prices, setPrices] = useState<Record<string, string>>({})
    const [currency, setCurrency] = useState<QuoteCurrency | ''>('')
    const [commitDate, setCommitDate] = useState('')
    const [err, setErr] = useState<string | null>(null)
    const [ok, setOk] = useState<string | null>(null)
    const { busy, run: runBusy } = useBusy((e) => setErr(errorText(t, e)))
    const [preview, setPreview] = useState<{ name: string; url: string; kind: PreviewKind; lineId: string; fileId: string } | null>(null)
    /** 点过「发出报价」才提示缺什么，输入过程中不实时报错 */
    const [tried, setTried] = useState(false)
    /** 填了还没发出的改动：点返回时先问一句，免得一桌子价格白填 */
    const [dirty, setDirty] = useState(false)

    /** prefill = true：用最近一版报价填输入框（首次加载、发出之后）。 */
    const load = useCallback(async (prefill: boolean) => {
        try {
            const o = await getOpsOrder(id)
            const [qs, mk] = await Promise.all([listOrderQuotes(id), getCustomerMarkup(o.customerOrgId)])
            setOrder(o)
            setQuotes(qs)
            setMarkup(mk)
            if (prefill && qs.length) {
                const latest = qs[0]
                setPrices(Object.fromEntries(latest.lines.map((l) => [l.lineId, String(l.unitPriceCny)])))
                setCurrency(latest.currency)
                setCommitDate(latest.commitDate)
            } else if (prefill) {
                // 还没报过价：承诺交期从客户的期望交期起（运营可改）
                setCommitDate(o.wantedDate ?? '')
            }
            setLoadErr(null)
        } catch (e) {
            if (e instanceof ApiError && (e.code === 404 || e.code === 400)) setMissing(true)
            else setLoadErr(errorText(t, e))
        }
    }, [id, t])

    useEffect(() => { void load(true) }, [load])

    // 从列表点进来时带着列表地址（含筛选和页码），返回就回到原样；直接打开的链接退回列表首页
    const backState = (location.state as { back?: string } | null)?.back
    const backTo = backState?.startsWith('/ops/quotes') ? backState : '/ops/quotes'
    const back = <Link className="btn sm qui" to={backTo} style={{ margin: '0 0 6px -9px' }}
        onClick={(e) => {
            if (!dirty) return
            e.preventDefault()
            void askConfirm(t.customer.partForm.discardConfirm, { danger: true }).then((yes) => { if (yes) navigate(backTo) })
        }}>{t.quoteWork.back}</Link>

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
    // 运营只看得到已提交的订单，提交时图号 / 名称 / 数量都已检查过（2026-11-27 起草稿可以空着）
    const totalQty = order.lines.reduce((a, l) => a + (l.quantity ?? 0), 0)

    /** 输入齐了且格式对才返回请求体，否则返回缺什么。 */
    const buildInput = (): SendQuoteInput | string => {
        if (!currency) return t.quoteWork.errCurrency
        if (!commitDate) return t.quoteWork.errCommitDate
        const lines: SendQuoteInput['lines'] = []
        for (const l of order.lines) {
            const raw = (prices[l.id] ?? '').trim()
            if (!PRICE_RE.test(raw) || Number(raw) <= 0) return t.quoteWork.errPrice(l.code ?? '')
            lines.push({ lineId: l.id, unitPriceCny: Number(raw) })
        }
        return { currency, commitDate, lines }
    }
    const input = buildInput()
    const inputProblem = typeof input === 'string' ? input : null

    const edit = (fn: () => void) => {
        fn()
        setOk(null)
        setDirty(true)
    }

    const run = (fn: () => Promise<void>) => runBusy(async () => {
        await fn()
        setErr(null)
    })

    const doSend = async () => {
        if (typeof input === 'string') { setTried(true); return }
        const replacing = order.status === 'QUOTED'
        const msg = replacing
            ? t.quoteWork.confirmResend
            : t.quoteWork.confirmSend
        if (!(await askConfirm(msg))) return
        void run(async () => {
            await sendQuote(order.id, input)
            setTried(false)
            setDirty(false)
            setOk(t.quoteWork.sent)
            await load(false)
        })
    }

    /** 看图是预览，不是下载：用不带 attachment 的签名 URL，在弹层里直接显示。 */
    const openPreview = (lineId: string, file: FileView) => run(async () => {
        const kind = previewKindOf(file.originalFilename)
        if (!kind) return
        const { url } = await opsLineFilePreviewUrl(order.id, lineId, file.id)
        setPreview({ name: file.originalFilename, url, kind, lineId, fileId: file.id })
    })

    /** 弹层里的「下载」才用带 attachment 的那个 URL。 */
    const download = (lineId: string, fileId: string) => run(async () => {
        window.location.assign((await opsLineFileViewUrl(order.id, lineId, fileId)).url)
    })

    return (
        <Page>
            <Hello
                back={back}
                title={order.title || t.common.untitledOrder}
                right={pill(orderSt(t)[order.status])}
            />

            <div className="t2" style={{ marginTop: -6, marginBottom: 14 }}>
                {t.quoteWork.context(order.customerName ?? X, order.wantedDate || X, totalQty)}
            </div>

            {err && <Banner tone="wa" style={{ marginBottom: 14 }}>{err}</Banner>}
            {ok && <Banner tone="ok" style={{ marginBottom: 14 }}>{ok}</Banner>}
            {order.status === 'CONFIRMED' && (
                <Banner tone="ok" style={{ marginBottom: 14 }}>{t.quoteWork.lockedBanner}</Banner>
            )}
            {order.status === 'CANCELLED' && (
                <Banner tone="wa" style={{ marginBottom: 14 }}>{t.quoteWork.cancelledBanner}</Banner>
            )}

            {(order.status === 'READY' || order.status === 'SHIPPED' || order.status === 'COMPLETED') && (
                <ShippingCard order={order} onChanged={() => load(false)} />
            )}

            <Card style={{ marginBottom: 16 }}>
                {(order.status === 'QUOTED' || !editable) && (
                    <CardHead title={editable ? t.quoteWork.requoteTitle : t.quoteWork.quoteTitle} />
                )}
                <CardBody flush>
                    <TableWrap>
                        <thead>
                            <tr>
                                <th className="n">#</th><th>{t.customer.orderDetail.colCode}</th><th>{t.quoteWork.colPart}</th>
                                <th>{t.quoteWork.colMaterial}</th><th>{t.quoteWork.colSurface}</th>
                                <th className="n">{t.customer.quotes.colQty}</th><th>{t.customer.orderDetail.colDrawing}</th>
                                <th>{t.quoteWork.colBasePrice}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {order.lines.map((l, i) => {
                                const raw = prices[l.id] ?? ''
                                const bad = raw.trim() !== '' && (!PRICE_RE.test(raw.trim()) || Number(raw.trim()) <= 0)
                                return (
                                    <tr key={l.id}>
                                        <td className="n">{i + 1}</td>
                                        {/* 图号单独一列；版本号运营不需要（报价只按零件和数量算） */}
                                        <td className="m">{l.code}</td>
                                        <td className="t1">{l.partName}</td>
                                        <td>{l.material || X}</td>
                                        <td>{l.surfaceTreatment || X}</td>
                                        <td className="n">{l.quantity}</td>
                                        <td>
                                            {/* 每个文件都列出来 —— 只给第一张的话，STEP 旁边那份标公差的 PDF 定价的人看不到。
                                                能预览的开预览，CAD 等格式点了直接下载 */}
                                            {l.revision.files.length ? l.revision.files.map((f) => (
                                                <div key={f.id}>
                                                    <button className="btn qui sm" type="button"
                                                        title={previewKindOf(f.originalFilename) ? undefined : t.customer.partForm.previewUnsupported}
                                                        onClick={() => previewKindOf(f.originalFilename)
                                                            ? void openPreview(l.id, f)
                                                            : void download(l.id, f.id)}>
                                                        {f.originalFilename}
                                                    </button>
                                                </div>
                                            )) : X}
                                        </td>
                                        <td>
                                            {editable
                                                ? <Input value={raw} bad={bad} style={{ width: 110 }}
                                                    onChange={(v) => edit(() => setPrices((st) => ({ ...st, [l.id]: v })))} />
                                                : X}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </TableWrap>
                </CardBody>

                {editable && (
                    <div className="qset">
                        {/* 报价系数是客户级配置，在「报价设置 / 组织」里维护，这里只看生效值 */}
                        <span className="lbl">{t.quoteWork.lblMarkup}
                            <b>{markup?.effectiveRate != null ? `× ${markup.effectiveRate}` : t.quoteWork.markupUnset}</b>
                        </span>
                        <span className="lbl">{t.quoteWork.lblCurrency}
                            <Select value={currency} options={['', ...QUOTE_CURRENCIES]} style={{ width: 96 }}
                                onChange={(v) => edit(() => setCurrency(v as QuoteCurrency | ''))} />
                        </span>
                        <span className="lbl">{t.quoteWork.lblCommitDate}
                            <DatePicker value={commitDate} onChange={(v) => edit(() => setCommitDate(v))} />
                        </span>
                        {/* 原价是两头价格的基准，不是成本：照抄 AI 成本进来，对供价只剩成本的八折（2026-11-24 需求方定口径） */}
                        <span className="tip">{t.quoteWork.basePriceHint}</span>
                    </div>
                )}

                {editable && (
                    <CardFoot
                        left={<span className="t2">{(tried && inputProblem) || (markup?.effectiveRate == null ? t.quoteWork.needMarkup : '')}</span>}
                        right={
                            <button className="btn pri" type="button" onClick={doSend}
                                disabled={busy || markup?.effectiveRate == null}>
                                {order.status === 'QUOTED' ? t.quoteWork.resendBtn : t.quoteWork.sendBtn}
                            </button>
                        }
                    />
                )}
            </Card>

            <EstimateCard orderId={order.id} lines={order.lines} editable={editable} />

            {/* 客户填的收货地址，运营只读（2026-11-23） */}
            <ShipToCard shipTo={order.shipTo} />

            {quotes.length > 0 && (
                <Card>
                    <CardHead title={t.quoteWork.historyTitle} />
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
                                        <td>{pill(quoteSt(t)[q.status])}</td>
                                        <td className="m">{q.currency}</td>
                                        <td className="n">{q.commitDate}</td>
                                        <td className="n">{t.quoteWork.markupTimes(q.markupRate)}</td>
                                        <td className="n">{fmtMoney(q.total, q.currency)}</td>
                                        <td className="n" style={{ fontFamily: 'var(--mono)' }}>
                                            {q.rateDate ?? X}
                                            <div className="t2">
                                                {q.priceLocked ? t.quoteWork.rateLocked : t.quoteWork.rateUnlocked}
                                            </div>
                                        </td>
                                        <td className="n">{fmtDateTime(new Date(q.sentAt))}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                </Card>
            )}
            {preview && (
                <FilePreviewModal name={preview.name} url={preview.url} kind={preview.kind}
                    onClose={() => setPreview(null)}
                    onDownload={() => download(preview.lineId, preview.fileId)} />
            )}
            {confirmDialog}
        </Page>
    )
}
