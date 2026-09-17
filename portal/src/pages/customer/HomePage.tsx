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
import { ORDER_ST } from './status'

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
                title={`你好，${session?.displayName ?? ''}`}
                right={<Link className="btn pri" to="/customer/orders">＋ 新建订单</Link>}
            />
            {err && <Banner tone="wa" style={{ marginBottom: 14 }}>{err}</Banner>}
            {toConfirm > 0 && (
                <Banner tone="wa" style={{ marginBottom: 14 }}>
                    有 {toConfirm} 单报价等你确认。<Link to="/customer/quotes" style={{ marginLeft: 6 }}>我的报价 →</Link>
                </Banner>
            )}
            <Card>
                <CardHead title="我的订单" right={orders ? <Pill tone="ne" dot={false}>{orders.length} 单</Pill> : undefined} />
                {orders === null ? (
                    <CardBody><Empty text="加载中…" /></CardBody>
                ) : orders.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr><th>名称</th><th className="n">零件</th><th className="n">建单</th><th>状态</th></tr>
                            </thead>
                            <tbody>
                                {orders.map((o) => (
                                    <tr className="clk" key={o.id} onClick={() => navigate(`/customer/orders/${o.id}`)}>
                                        <td className="t1">{o.title || '未命名订单'}</td>
                                        <td className="n">{o.lineCount}</td>
                                        <td className="n">{fmtDate(new Date(o.createdAt))}</td>
                                        <td>{pill(ORDER_ST[o.status])}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                ) : (
                    <CardBody>
                        <Empty text="还没有订单" action={<Link className="btn pri" to="/customer/orders">建第一个订单</Link>} />
                    </CardBody>
                )}
            </Card>
        </Page>
    )
}
