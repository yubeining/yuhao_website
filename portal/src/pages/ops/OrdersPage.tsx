import { Bar, Card, CardBody, Empty, Hello, Page, Pill, pill, TableWrap } from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { findCompany } from '../../mock/actions'
import { money } from '../../mock/format'
import { orderTotal, progress } from '../../mock/selectors'
import { ORD_ST } from '../customer/status'

export function OpsOrdersPage() {
    const { state } = useMock()
    const orders = state.db.orders

    return (
        <Page>
            <Hello title="订单" />
            <Card>
                {orders.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>订单</th><th>客户</th><th className="n">零件</th><th className="n">金额</th>
                                    <th className="n">下单</th><th>进度</th><th>客户回款</th><th>状态</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orders.map((o) => (
                                    <tr className="clk" key={o.id}>
                                        <td><span className="m">{o.id}</span></td>
                                        <td className="t1">{findCompany(state, o.companyId)?.name}</td>
                                        <td className="n">{o.parts.length}</td>
                                        <td className="n">{money(orderTotal(state, o))}</td>
                                        <td className="n">{o.at.slice(0, 10)}</td>
                                        <td style={{ minWidth: 100 }}><Bar pct={progress(o)} /></td>
                                        <td>
                                            {o.paidAt ? <Pill tone="ok">已回款</Pill> : <Pill tone="wa">未回款</Pill>}
                                        </td>
                                        <td>{pill(ORD_ST[o.status])}</td>
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
