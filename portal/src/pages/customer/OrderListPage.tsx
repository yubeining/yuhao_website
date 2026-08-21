import { useNavigate } from 'react-router-dom'
import { Bar, Card, CardBody, Empty, Hello, Page, Pill, pill, TableWrap } from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { money, sum } from '../../mock/format'
import { num } from '../../mock/params'
import { myOrders, orderTotal, progress } from '../../mock/selectors'
import { ORD_ST } from './status'

export function OrderListPage() {
    const { state } = useMock()
    const navigate = useNavigate()
    const orders = myOrders(state)

    return (
        <Page>
            <Hello title="我的订单" right={<Pill tone="ne" dot={false}>共 {orders.length} 单</Pill>} />
            <Card>
                {orders.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>订单号</th><th className="n">零件行数</th><th className="n">总件数</th>
                                    <th className="n">金额</th><th className="n">下单</th><th className="n">预计送达</th>
                                    <th>进度</th><th>状态</th><th />
                                </tr>
                            </thead>
                            <tbody>
                                {orders.map((o) => (
                                    <tr className="clk" key={o.id} onClick={() => navigate(`/customer/orders/${o.id}`)}>
                                        <td><span className="m">{o.id}</span></td>
                                        <td className="n">{o.items.length}</td>
                                        <td className="n">{sum(o.items, (i) => num(i.qty))}</td>
                                        <td className="n"><b>{money(orderTotal(state, o))}</b></td>
                                        <td className="n">{o.at.slice(0, 10)}</td>
                                        <td className="n">{o.eta}</td>
                                        <td style={{ minWidth: 110 }}><Bar pct={progress(o)} /></td>
                                        <td>{pill(ORD_ST[o.status])}</td>
                                        <td style={{ textAlign: 'right', color: 'var(--faint)' }}>›</td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                ) : (
                    <CardBody><Empty text="还没有订单" /></CardBody>
                )}
            </Card>
        </Page>
    )
}
