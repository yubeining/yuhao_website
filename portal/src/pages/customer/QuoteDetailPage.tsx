/**
 * 报价详情 —— 客户在这里看逐行价格，确认或拒绝。路由参数是订单 id（一张订单同时只有一份有效报价）。
 *
 * ★ 客户只看到对客单价、小计、总计、交期和汇率日期；原价、加成率、汇率数字不给（2026-09-17 拍板）。
 * ★ 确认前价格按最新汇率现算，会变 —— 确认按钮上方必须写明，否则客户看到数字莫名其妙地变。
 *   确认时把看到的汇率日期带回去，服务端汇率已更新就拒绝，页面刷新成新价格让客户重看。
 * ★ 拒绝后订单回到「已提交」，等平台重新报价；拒绝不收原因（没定要不要收）。
 *   拒绝的那一版仍然显示（没有价格），并写明在等重报 —— 不显示成「暂无报价」，否则客户不知道发生了什么。
 */

import { useCallback, useEffect, useState } from 'react'
import { useBusy } from '../../components/useBusy'
import { Link, useParams } from 'react-router-dom'
import {
    Banner, Card, CardBody, CardFoot, CardHead, Empty, Fields, Fld, Hello, Page, pill, TableWrap,
} from '../../components/ui'
import { ConfirmDialog, useConfirm } from '../../components/ConfirmDialog'
import { errorText } from '../../i18n/errorText'
import { useI18n } from '../../i18n/I18nProvider'
import { fmtDateTime, fmtMoney, X } from '../../lib/format'
import {
    ApiError, confirmQuote, getOrderQuote, rejectQuote, type CustomerQuoteView,
} from '../../services'
import { quoteSt } from './status'

export function QuoteDetailPage() {
    const { t } = useI18n()
    const [askConfirm, confirmDialog] = useConfirm()
    const { id = '' } = useParams()
    const [quote, setQuote] = useState<CustomerQuoteView | null>(null)
    const [missing, setMissing] = useState(false)
    const [loadErr, setLoadErr] = useState<string | null>(null)
    const [err, setErr] = useState<string | null>(null)
    // 出错时重新拉一次：报价可能已经被别人确认 / 改过，按服务端最新状态显示
    const { busy, run } = useBusy(async (e) => {
        setErr(errorText(t, e))
        await load()
    })
    /** 确认是不可逆的（锁汇率、客户侧没有撤回的流转），所以点了先问一次；拒绝反而可以重报。 */
    const [asking, setAsking] = useState(false)

    const load = useCallback(async () => {
        try {
            setQuote(await getOrderQuote(id))
            setMissing(false)
            setLoadErr(null)
        } catch (e) {
            // 400 = id 不是合法格式（旧原型留下的书签），和 404 一样按「没有报价」处理
            if (e instanceof ApiError && (e.code === 404 || e.code === 400)) setMissing(true)
            else setLoadErr(errorText(t, e))
        }
    }, [id, t])

    useEffect(() => { void load() }, [load])

    const back = <Link className="btn sm qui" to="/customer/quotes" style={{ margin: '0 0 6px -9px' }}>← {t.customer.quotes.title}</Link>

    if (missing) {
        return (
            <Page>
                <Hello back={back} title={t.customer.quotes.detailTitle} />
                <Card><CardBody>
                    <Empty text={t.customer.quotes.noQuote} sub={t.customer.quotes.noQuoteSub}
                        action={<Link className="btn" to={`/customer/orders/${id}`}>{t.customer.quotes.viewOrder}</Link>} />
                </CardBody></Card>
            </Page>
        )
    }
    if (!quote) {
        return (
            <Page><Card><CardBody>
                {loadErr
                    ? <Empty text={loadErr} action={<button className="btn" type="button" onClick={() => void load()}>{t.common.retry}</button>} />
                    : <Empty text={t.common.loading} />}
            </CardBody></Card></Page>
        )
    }

    const open = quote.status === 'SENT'
    const rejected = quote.status === 'REJECTED'

    const act = (fn: () => Promise<CustomerQuoteView>) => run(async () => {
        setQuote(await fn())
        setErr(null)
    })

    const confirm = async () => {
        if (!quote.rateDate) return
        const rateDate = quote.rateDate
        await act(() => confirmQuote(quote.orderId, quote.id, rateDate))
        setAsking(false)
    }

    const reject = async () => {
        if (!(await askConfirm(t.customer.quotes.rejectConfirm, { danger: true }))) return
        void act(() => rejectQuote(quote.orderId, quote.id))
    }

    return (
        <Page>
            <Hello
                back={back}
                title={t.customer.quotes.detailTitle}
                right={
                    <>
                        {pill(quoteSt(t)[quote.status])}
                        <Link className="btn" to={`/customer/orders/${quote.orderId}`}>{t.customer.quotes.viewOrder}</Link>
                    </>
                }
            />

            {err && <Banner tone="wa" style={{ marginBottom: 14 }}>{err}</Banner>}
            {open && (
                <Banner tone="in" style={{ marginBottom: 14 }}>
                    {t.customer.quotes.rateNote(quote.rateDate ?? X)}
                </Banner>
            )}
            {rejected && (
                <Banner tone="wa" style={{ marginBottom: 14 }}>
                    {t.customer.quotes.rejected}
                </Banner>
            )}
            {quote.status === 'CONFIRMED' && (
                <Banner tone="ok" style={{ marginBottom: 14 }}>
                    {t.customer.quotes.confirmedAt(quote.confirmedAt ? fmtDateTime(new Date(quote.confirmedAt)) : X, quote.rateDate ?? X)}
                </Banner>
            )}

            <Card style={{ marginBottom: 16 }}>
                <CardHead title={t.customer.quotes.infoTitle} />
                <CardBody>
                    <Fields>
                        <Fld k={t.customer.quotes.fldCurrency} v={quote.currency} mono />
                        <Fld k={t.customer.quotes.fldLeadTime} v={quote.commitDate} />
                        <Fld k={t.customer.quotes.fldQuotedAt} v={fmtDateTime(new Date(quote.sentAt))} mono />
                        {!rejected && <Fld k={t.customer.quotes.fldRateDate} v={quote.rateDate ?? X} mono />}
                    </Fields>
                </CardBody>
            </Card>

            <Card>
                <CardHead title={t.customer.quotes.partsHeader(quote.lines.length)} />
                <CardBody flush>
                    <TableWrap>
                        <thead>
                            <tr>
                                <th className="n">#</th><th>{t.customer.quotes.colCode}</th><th>{t.common.table.name}</th>
                                <th className="n">{t.customer.quotes.colQty}</th>
                                {!rejected && <><th className="n">{t.customer.quotes.colUnit}</th><th className="n">{t.customer.quotes.colSubtotal}</th></>}
                            </tr>
                        </thead>
                        <tbody>
                            {quote.lines.map((l, i) => (
                                <tr key={l.lineId}>
                                    <td className="n">{i + 1}</td>
                                    <td><span className="m">{l.code}</span></td>
                                    <td className="t1">{l.partName}</td>
                                    <td className="n">{l.quantity}</td>
                                    {!rejected && <>
                                        <td className="n">{fmtMoney(l.unitPrice, quote.currency)}</td>
                                        <td className="n">{fmtMoney(l.lineTotal, quote.currency)}</td>
                                    </>}
                                </tr>
                            ))}
                            {!rejected && (
                                <tr>
                                    <td colSpan={5} className="n"><b>{t.customer.quotes.total}</b></td>
                                    <td className="n"><b>{fmtMoney(quote.total, quote.currency)}</b></td>
                                </tr>
                            )}
                        </tbody>
                    </TableWrap>
                </CardBody>
                {open && (
                    <CardFoot
                        left={<button className="btn" type="button" onClick={reject} disabled={busy}>{t.customer.quotes.reject}</button>}
                        right={
                            <button className="btn pri" type="button" onClick={() => setAsking(true)} disabled={busy || !quote.rateDate}>
                                {t.customer.quotes.confirmPrice(fmtMoney(quote.total, quote.currency))}
                            </button>
                        }
                    />
                )}
            </Card>
            {asking && open && (
                <ConfirmDialog
                    title={t.customer.quotes.confirmTitle}
                    message={t.customer.quotes.confirmBody(fmtMoney(quote.total, quote.currency), quote.commitDate)}
                    confirmLabel={t.customer.quotes.confirmCta}
                    busy={busy}
                    onCancel={() => setAsking(false)}
                    onConfirm={() => { void confirm() }}
                />
            )}
            {confirmDialog}
        </Page>
    )
}
