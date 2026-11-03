/**
 * 运营看报价 —— 按订单状态分三栏：待报价、待客户确认、已确认。点进去是报价工作台。
 *
 * ★ 数据来自后端（2026-09-17 起，第 3 步）。以前这一页是原型假数据（毛利率、AI 来源等），
 *   那些在人工报价里都没有数据来源，已删掉（CLAUDE.md §10 C5）。
 */

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardBody, CardHead, Empty, Hello, Page, pill, TableWrap } from '../../components/ui'
import { errorText } from '../../i18n/errorText'
import { useMock } from '../../mock/MockProvider'
import { fmtDateTime, X } from '../../mock/format'
import {
    listOpsOrders, listQuoteSummaries, type OpsOrderSummaryView, type OpsQuoteSummaryView, type OrderStatus,
} from '../../services'
import { orderSt, quoteSt } from '../customer/status'

/** 三个分页标签。文案随语言变，所以是函数不是常量。 */
const tabs = (t: ReturnType<typeof useMock>['t']): [OrderStatus, string][] => [
    ['SUBMITTED', t.ops.quotes.tabSubmitted],
    ['QUOTED', t.ops.quotes.tabQuoted],
    ['CONFIRMED', t.ops.quotes.tabConfirmed],
]

export function OpsQuotesPage() {
    const { t } = useMock()
    const navigate = useNavigate()
    const [tab, setTab] = useState<OrderStatus>('SUBMITTED')
    const [orders, setOrders] = useState<OpsOrderSummaryView[] | null>(null)
    /** 每张单最新一版报价。「待报价」里有这一项且是被拒的，说明是客户拒绝后退回来的，不是新单。 */
    const [latest, setLatest] = useState<Record<string, OpsQuoteSummaryView>>({})
    const [total, setTotal] = useState(0)
    const [err, setErr] = useState<string | null>(null)

    const load = useCallback(async () => {
        setOrders(null)
        try {
            const page = await listOpsOrders(tab, 1, 100)
            const summaries = await listQuoteSummaries(page.items.map((o) => o.id))
            setLatest(Object.fromEntries(summaries.map((q) => [q.orderId, q])))
            setOrders(page.items)
            setTotal(page.total)
            setErr(null)
        } catch (e) {
            setErr(errorText(t, e))
        }
    }, [tab, t])

    useEffect(() => { void load() }, [load])

    return (
        <Page>
            <Hello
                title={t.ops.quotes.title}
                right={
                    <>
                        {tabs(t).map(([st, label]) => (
                            <button key={st} type="button" className={`btn${tab === st ? ' pri' : ''}`}
                                onClick={() => setTab(st)}>{label}</button>
                        ))}
                    </>
                }
            />
            <Card>
                <CardHead title={tabs(t).find(([st]) => st === tab)?.[1] ?? ''} rid={orders ? t.ops.quotes.orderCount(total) : undefined} />
                {orders === null ? (
                    <CardBody>
                        {err
                            ? <Empty text={err} action={<button className="btn" type="button" onClick={() => void load()}>{t.common.retry}</button>} />
                            : <Empty text={t.common.loading} />}
                    </CardBody>
                ) : orders.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>{t.common.table.order}</th><th>{t.ops.orders.colCustomer}</th><th className="n">{t.common.table.parts}</th><th className="n">{t.ops.quotes.colQty}</th>
                                    <th className="n">{t.ops.quotes.colLead}</th><th className="n">{t.ops.quotes.colSubmitted}</th><th>{t.common.table.status}</th><th>{t.ops.quotes.colQuote}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orders.map((o) => (
                                    <tr className="clk" key={o.id} onClick={() => navigate(`/ops/quotes/${o.id}`)}>
                                        <td className="t1">{o.title || t.common.untitledOrder}</td>
                                        <td>{o.customerName ?? X}</td>
                                        <td className="n">{o.lineCount}</td>
                                        <td className="n">{o.totalQuantity}</td>
                                        <td className="n">{o.wantedLeadDays ? t.ops.quotes.leadDays(o.wantedLeadDays) : X}</td>
                                        <td className="n">{o.submittedAt ? fmtDateTime(new Date(o.submittedAt)) : X}</td>
                                        <td>{pill(orderSt(t)[o.status])}</td>
                                        <td>
                                            {latest[o.id]
                                                ? <>{pill(quoteSt(t)[latest[o.id].latestStatus])} <span className="t2">{t.ops.quotes.version(latest[o.id].latestVersionNo)}</span></>
                                                : <span className="t2">{t.ops.quotes.never}</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                ) : (
                    <CardBody><Empty text={t.ops.quotes.empty} /></CardBody>
                )}
            </Card>
        </Page>
    )
}
