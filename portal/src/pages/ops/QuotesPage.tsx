/**
 * 运营看报价 —— 默认列出全部（待报价 / 待客户确认 / 已确认），状态是筛选项而不是三个互斥的页签。
 *
 * ★ 2026-11-15 改：原来一进来只显示「待报价」，其余两栏的订单要切页签才看得到；
 *   运营关心的是"我手上有哪些单"，先给全量，再按状态筛。点进去是报价工作台。
 *
 * ★ 数据来自后端（2026-09-17 起，第 3 步）。以前这一页是原型假数据（毛利率、AI 来源等），
 *   那些在人工报价里都没有数据来源，已删掉（CLAUDE.md §10 C5）。
 */

import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Card, CardBody, CardHead, Empty, Hello, Page, pill, TableWrap } from '../../components/ui'
import { errorText } from '../../i18n/errorText'
import { useMock } from '../../mock/MockProvider'
import { fmtDateTime, X } from '../../mock/format'
import { Pagination } from '../../components/Pagination'
import {
    listOpsOrders, listQuoteSummaries, type OpsOrderSummaryView, type OpsQuoteSummaryView, type OrderStatus,
} from '../../services'
import { orderSt, quoteSt } from '../customer/status'

/** 筛选项：全部 + 三个状态。文案随语言变，所以是函数不是常量。 */
const filters = (t: ReturnType<typeof useMock>['t']): [OrderStatus | 'ALL', string][] => [
    ['ALL', t.ops.quotes.filterAll],
    ['SUBMITTED', t.ops.quotes.tabSubmitted],
    ['QUOTED', t.ops.quotes.tabQuoted],
    ['CONFIRMED', t.ops.quotes.tabConfirmed],
]

export function OpsQuotesPage() {
    const { t } = useMock()
    const navigate = useNavigate()
    const location = useLocation()
    // ★ 筛选和页码放在网址里（?tab=SUBMITTED&page=3）：进报价工作台再返回、刷新、转发链接都不丢。
    //   以前放在 useState 里，处理完一单返回就回到「全部」第 1 页，要重新筛一遍。
    const [params, setParams] = useSearchParams()
    const rawTab = params.get('tab')
    const tab: OrderStatus | 'ALL' = filters(t).some(([st]) => st === rawTab) ? rawTab as OrderStatus : 'ALL'
    const page = Math.max(1, Number(params.get('page')) || 1)
    const setTab = (st: OrderStatus | 'ALL') => setParams(st === 'ALL' ? {} : { tab: st }, { replace: true })
    const setPage = (p: number) => setParams((prev) => {
        const next = new URLSearchParams(prev)
        if (p > 1) next.set('page', String(p)); else next.delete('page')
        return next
    }, { replace: true })
    const [orders, setOrders] = useState<OpsOrderSummaryView[] | null>(null)
    /** 每张单最新一版报价。「待报价」里有这一项且是被拒的，说明是客户拒绝后退回来的，不是新单。 */
    const [latest, setLatest] = useState<Record<string, OpsQuoteSummaryView>>({})
    const [total, setTotal] = useState(0)
    const [err, setErr] = useState<string | null>(null)

    const load = useCallback(async (pageNo: number) => {
        setOrders(null)
        try {
            const page = await listOpsOrders(tab === 'ALL' ? undefined : tab, pageNo, 20)
            const summaries = await listQuoteSummaries(page.items.map((o) => o.id))
            setLatest(Object.fromEntries(summaries.map((q) => [q.orderId, q])))
            setOrders(page.items)
            setTotal(page.total)
            setErr(null)
        } catch (e) {
            setErr(errorText(t, e))
        }
    }, [tab, t])

    useEffect(() => { void load(page) }, [load, page])

    return (
        <Page>
            <Hello
                title={t.ops.quotes.title}
                right={
                    <>
                        {filters(t).map(([st, label]) => (
                            <button key={st} type="button" className={`btn${tab === st ? ' pri' : ''}`}
                                onClick={() => setTab(st)}>{label}</button>
                        ))}
                    </>
                }
            />
            <Card>
                <CardHead title={filters(t).find(([st]) => st === tab)?.[1] ?? ''} rid={orders ? t.ops.quotes.orderCount(total) : undefined} />
                {orders === null ? (
                    <CardBody>
                        {err
                            ? <Empty text={err} action={<button className="btn" type="button" onClick={() => void load(page)}>{t.common.retry}</button>} />
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
                                    <tr className="clk" key={o.id} onClick={() => navigate(`/ops/quotes/${o.id}`, { state: { back: location.pathname + location.search } })}>
                                        <td className="t1">{o.title || t.common.untitledOrder}</td>
                                        <td>{o.customerName ?? X}</td>
                                        <td className="n">{o.lineCount}</td>
                                        <td className="n">{o.totalQuantity}</td>
                                        <td className="n">{o.wantedDate || X}</td>
                                        <td className="n">{o.submittedAt ? fmtDateTime(new Date(o.submittedAt)) : X}</td>
                                        <td>{pill(orderSt(t)[o.status])}</td>
                                        <td>
                                            {latest[o.id]
                                                ? pill(quoteSt(t)[latest[o.id].latestStatus])
                                                : <span className="t2">{t.ops.quotes.never}</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                        <Pagination page={page} pageSize={20} total={total}
                            onChange={setPage} />
                    </CardBody>
                ) : (
                    <CardBody><Empty text={t.ops.quotes.empty} /></CardBody>
                )}
            </Card>
        </Page>
    )
}
