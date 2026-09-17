/**
 * 报价详情 —— 客户在这里看逐行价格，确认或拒绝。路由参数是订单 id（一张订单同时只有一份有效报价）。
 *
 * ★ 客户只看到对客单价、小计、总计、交期和汇率日期；原价、加成率、汇率数字不给（2026-09-17 拍板）。
 * ★ 确认前价格按最新汇率现算，会变 —— 确认按钮上方必须写明，否则客户看到数字莫名其妙地变。
 *   确认时把看到的汇率日期带回去，服务端汇率已更新就拒绝，页面刷新成新价格让客户重看。
 * ★ 拒绝后订单回到「已提交」，等平台重新报价；拒绝不收原因（没定要不要收）。
 */

import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
    Banner, Card, CardBody, CardFoot, CardHead, Empty, Fields, Fld, Hello, Page, pill, TableWrap,
} from '../../components/ui'
import { errorText } from '../../i18n/errorText'
import { useMock } from '../../mock/MockProvider'
import { fmtDateTime, fmtMoney, X } from '../../mock/format'
import {
    ApiError, confirmQuote, getOrderQuote, rejectQuote, type CustomerQuoteView,
} from '../../services'
import { QUOTE_ST } from './status'

export function QuoteDetailPage() {
    const { t } = useMock()
    const { id = '' } = useParams()
    const [quote, setQuote] = useState<CustomerQuoteView | null>(null)
    const [missing, setMissing] = useState(false)
    const [loadErr, setLoadErr] = useState<string | null>(null)
    const [err, setErr] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

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

    const back = <Link className="btn sm qui" to="/customer/quotes" style={{ margin: '0 0 6px -9px' }}>← 我的报价</Link>

    if (missing) {
        return (
            <Page>
                <Hello back={back} title="报价" />
                <Card><CardBody>
                    <Empty text="暂无报价" sub="这张订单目前没有待确认或已确认的报价"
                        action={<Link className="btn" to={`/customer/orders/${id}`}>查看订单</Link>} />
                </CardBody></Card>
            </Page>
        )
    }
    if (!quote) {
        return (
            <Page><Card><CardBody>
                {loadErr
                    ? <Empty text={loadErr} action={<button className="btn" type="button" onClick={() => void load()}>重试</button>} />
                    : <Empty text="加载中…" />}
            </CardBody></Card></Page>
        )
    }

    const open = quote.status === 'SENT'

    const act = async (fn: () => Promise<CustomerQuoteView>) => {
        setBusy(true)
        try {
            setQuote(await fn())
            setErr(null)
        } catch (e) {
            setErr(errorText(t, e))
            await load()
        } finally {
            setBusy(false)
        }
    }

    const confirm = () => {
        if (!quote.rateDate) return
        const rateDate = quote.rateDate
        void act(() => confirmQuote(quote.orderId, quote.id, rateDate))
    }

    const reject = () => {
        if (!window.confirm('拒绝这份报价？订单会退回，等平台重新报价。')) return
        void act(async () => {
            const r = await rejectQuote(quote.orderId, quote.id)
            setMissing(true)
            return r
        })
    }

    return (
        <Page>
            <Hello
                back={back}
                title="报价"
                right={
                    <>
                        {pill(QUOTE_ST[quote.status])}
                        <Link className="btn" to={`/customer/orders/${quote.orderId}`}>查看订单</Link>
                    </>
                }
            />

            {err && <Banner tone="wa" style={{ marginBottom: 14 }}>{err}</Banner>}
            {open && (
                <Banner tone="in" style={{ marginBottom: 14 }}>
                    价格按 <b>{quote.rateDate ?? X}</b> 的汇率计算，<b>确认前会随汇率变动</b>；点「确认价格」时按当时显示的价格锁定。
                </Banner>
            )}
            {quote.status === 'CONFIRMED' && (
                <Banner tone="ok" style={{ marginBottom: 14 }}>
                    已于 {quote.confirmedAt ? fmtDateTime(new Date(quote.confirmedAt)) : X} 确认，价格已锁定（汇率日期 {quote.rateDate ?? X}）。
                </Banner>
            )}

            <Card style={{ marginBottom: 16 }}>
                <CardHead title="报价信息" />
                <CardBody>
                    <Fields>
                        <Fld k="币种" v={quote.currency} mono />
                        <Fld k="交期" v={`确认后 ${quote.leadDays} 天`} />
                        <Fld k="报价时间" v={fmtDateTime(new Date(quote.sentAt))} mono />
                        <Fld k="汇率日期" v={quote.rateDate ?? X} mono />
                    </Fields>
                </CardBody>
            </Card>

            <Card>
                <CardHead title={`零件 ${quote.lines.length} 个`} />
                <CardBody flush>
                    <TableWrap>
                        <thead>
                            <tr>
                                <th className="n">#</th><th>图号</th><th>名称</th>
                                <th className="n">数量</th><th className="n">单价</th><th className="n">小计</th>
                            </tr>
                        </thead>
                        <tbody>
                            {quote.lines.map((l, i) => (
                                <tr key={l.lineId}>
                                    <td className="n">{i + 1}</td>
                                    <td><span className="m">{l.code}</span></td>
                                    <td className="t1">{l.partName}</td>
                                    <td className="n">{l.quantity}</td>
                                    <td className="n">{fmtMoney(l.unitPrice, quote.currency)}</td>
                                    <td className="n">{fmtMoney(l.lineTotal, quote.currency)}</td>
                                </tr>
                            ))}
                            <tr>
                                <td colSpan={5} className="n"><b>总计</b></td>
                                <td className="n"><b>{fmtMoney(quote.total, quote.currency)}</b></td>
                            </tr>
                        </tbody>
                    </TableWrap>
                </CardBody>
                {open && (
                    <CardFoot
                        left={<button className="btn" type="button" onClick={reject} disabled={busy}>拒绝报价</button>}
                        right={
                            <button className="btn pri" type="button" onClick={confirm} disabled={busy || !quote.rateDate}>
                                确认价格（{fmtMoney(quote.total, quote.currency)}）
                            </button>
                        }
                    />
                )}
            </Card>
        </Page>
    )
}
