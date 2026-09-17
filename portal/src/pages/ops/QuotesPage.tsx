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
import { listOpsOrders, type OpsOrderSummaryView, type OrderStatus } from '../../services'
import { ORDER_ST } from '../customer/status'

const TABS: [OrderStatus, string][] = [
    ['SUBMITTED', '待报价'],
    ['QUOTED', '待客户确认'],
    ['CONFIRMED', '已确认'],
]

export function OpsQuotesPage() {
    const { t } = useMock()
    const navigate = useNavigate()
    const [tab, setTab] = useState<OrderStatus>('SUBMITTED')
    const [orders, setOrders] = useState<OpsOrderSummaryView[] | null>(null)
    const [total, setTotal] = useState(0)
    const [err, setErr] = useState<string | null>(null)

    const load = useCallback(async () => {
        setOrders(null)
        try {
            const page = await listOpsOrders(tab, 1, 100)
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
                title="报价"
                right={
                    <>
                        {TABS.map(([st, label]) => (
                            <button key={st} type="button" className={`btn${tab === st ? ' pri' : ''}`}
                                onClick={() => setTab(st)}>{label}</button>
                        ))}
                    </>
                }
            />
            <Card>
                <CardHead title={TABS.find(([st]) => st === tab)?.[1] ?? ''} rid={orders ? `${total} 单` : undefined} />
                {orders === null ? (
                    <CardBody>
                        {err
                            ? <Empty text={err} action={<button className="btn" type="button" onClick={() => void load()}>重试</button>} />
                            : <Empty text="加载中…" />}
                    </CardBody>
                ) : orders.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>订单</th><th>客户</th><th className="n">零件</th><th className="n">总件数</th>
                                    <th className="n">客户期望交期</th><th className="n">提交时间</th><th>状态</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orders.map((o) => (
                                    <tr className="clk" key={o.id} onClick={() => navigate(`/ops/quotes/${o.id}`)}>
                                        <td className="t1">{o.title || '未命名订单'}</td>
                                        <td>{o.customerName ?? X}</td>
                                        <td className="n">{o.lineCount}</td>
                                        <td className="n">{o.totalQuantity}</td>
                                        <td className="n">{o.wantedLeadDays ? `${o.wantedLeadDays} 天（仅参考）` : X}</td>
                                        <td className="n">{o.submittedAt ? fmtDateTime(new Date(o.submittedAt)) : X}</td>
                                        <td>{pill(ORDER_ST[o.status])}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                ) : (
                    <CardBody><Empty text="暂无订单" /></CardBody>
                )}
            </Card>
        </Page>
    )
}
