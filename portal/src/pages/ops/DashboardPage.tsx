/**
 * 内部工作台。
 *
 * ★ 只有「待考察供应商」会转黄 —— 那是唯一一件我方拖着不动就会出问题的事。
 *   其余三个是客户侧和供应商侧在推进的进度，我方看得见、但推不动，
 *   所以是纯计数，不该抢注意力，也不给行动按钮。
 */

import { useNavigate } from 'react-router-dom'
import { Card, CardBody, CardHead, Empty, Hello, Kpi, Kpis, Page, TableWrap } from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { findCompany } from '../../mock/actions'
import { money } from '../../mock/format'
import { confirmedOrders, draftProds, openProds, orderTotal, pendingSuppliers, publishedOrders } from '../../mock/selectors'

export function OpsDashboardPage() {
    const { state } = useMock()
    const navigate = useNavigate()
    const toPublish = confirmedOrders(state)
    const finding = publishedOrders(state)
    const pending = pendingSuppliers(state)

    return (
        <Page>
            <Hello title="工作台" />
            <Kpis>
                {/* ★ 「待安排生产」是运营自己的待办：客户确认了价，零件等着被组进生产订单 */}
                <Kpi k="待安排生产" v={toPublish.length} d="已确认价格，等运营组包" alert={toPublish.length > 0} />
                <Kpi k="组包中" v={draftProds(state).length} d="草稿，还没挂出去" />
                <Kpi k="在挂生产订单" v={openProds(state).length} d="等供应商接单" />
                <Kpi k="已安排生产" v={finding.length} d="产能还没锁满的客户订单" />
                <Kpi k="待考察供应商" v={pending.length} d="已提交材料" alert={pending.length > 0} />
            </Kpis>

            <Card>
                <CardHead title="已确认价格，等运营组包" />
                {toPublish.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>订单</th><th>客户</th><th className="n">零件</th>
                                    <th className="n">金额</th><th className="n">确认时间</th>
                                </tr>
                            </thead>
                            <tbody>
                                {toPublish.map((o) => (
                                    <tr className="clk" key={o.id} onClick={() => navigate('/ops/dispatch')}>
                                        <td><span className="m">{o.id}</span></td>
                                        <td className="t1">{findCompany(state, o.companyId)?.name}</td>
                                        <td className="n">{o.parts.length}</td>
                                        <td className="n">{money(orderTotal(state, o))}</td>
                                        <td className="n">{o.confirmedAt?.slice(0, 10) ?? '——'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                ) : (
                    <CardBody><Empty text="没有等待发布的单" /></CardBody>
                )}
            </Card>
        </Page>
    )
}
