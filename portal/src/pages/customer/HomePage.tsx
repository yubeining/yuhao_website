/**
 * 客户概览。
 *
 * ★ 数据来自后端。「待确认报价」提示按订单状态 QUOTED 数出来。
 */

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Banner, Card, CardBody, CardHead, Empty, Hello, Page, Pill, pill, TableWrap } from '../../components/ui'
import { useSession } from '../../auth/useSession'
import { errorText } from '../../i18n/errorText'
import { useMock } from '../../mock/MockProvider'
import { fmtDate } from '../../mock/format'
import { listOrders, type OrderSummaryView } from '../../services'
import { orderSt } from './status'

export function CustomerHomePage() {
    const { t } = useMock()
    const session = useSession()
    const navigate = useNavigate()
    const [orders, setOrders] = useState<OrderSummaryView[] | null>(null)
    const [err, setErr] = useState<string | null>(null)

    useEffect(() => {
        listOrders(1, 100)
            .then((p) => setOrders(p.items.filter((o) => o.status !== 'CANCELLED')))
            .catch((e) => setErr(errorText(t, e)))
    }, [t])

    const toConfirm = orders?.filter((o) => o.status === 'QUOTED').length ?? 0

    return (
        <Page>
            <Hello
                title={t.customer.home.greeting(session?.displayName ?? '')}
                right={<Link className="btn pri" to="/customer/orders">{t.customer.home.newOrder}</Link>}
            />
            {err && <Banner tone="wa" style={{ marginBottom: 14 }}>{err}</Banner>}
            {toConfirm > 0 && (
                <Banner tone="wa" style={{ marginBottom: 14 }}>
                    {t.customer.home.quotesPending(toConfirm)}<Link to="/customer/quotes" style={{ marginLeft: 6 }}>{t.customer.home.viewQuotes}</Link>
                </Banner>
            )}
            <Card>
                <CardHead title={t.customer.home.myOrders} right={orders ? <Pill tone="ne" dot={false}>{t.customer.home.orderCount(orders.length)}</Pill> : undefined} />
                {orders === null ? (
                    <CardBody><Empty text={t.common.loading} /></CardBody>
                ) : orders.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr><th>{t.common.table.name}</th><th className="n">{t.common.table.parts}</th><th className="n">{t.common.table.created}</th><th>{t.common.table.status}</th></tr>
                            </thead>
                            <tbody>
                                {orders.map((o) => (
                                    <tr className="clk" key={o.id} onClick={() => navigate(`/customer/orders/${o.id}`)}>
                                        <td className="t1">{o.title || t.common.untitledOrder}</td>
                                        <td className="n">{o.lineCount}</td>
                                        <td className="n">{fmtDate(new Date(o.createdAt))}</td>
                                        <td>{pill(orderSt(t)[o.status])}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                ) : (
                    <CardBody>
                        <Empty text={t.customer.home.empty} action={<Link className="btn pri" to="/customer/orders">{t.customer.home.createFirst}</Link>} />
                    </CardBody>
                )}
            </Card>
        </Page>
    )
}
