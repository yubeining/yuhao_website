/**
 * 内部工作台。
 *
 * ★ 四个 KPI 里有两个会转黄（待产能确认、待考察供应商）——
 *   它们是**有时限**的：产能确认期过了单子就要退，供应商晾着就跑了。
 *   另外两个是纯计数，不该抢注意力。
 */

import { useNavigate } from 'react-router-dom'
import { Card, CardBody, CardHead, Empty, Hello, Kpi, Kpis, Page, Pill, TableWrap } from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { findCompany } from '../../mock/actions'
import { money } from '../../mock/format'
import { capacityOrders, openPkgs, orderTotal, pendingSuppliers, pkgsOf } from '../../mock/selectors'

export function OpsDashboardPage() {
    const { state } = useMock()
    const navigate = useNavigate()
    const capacity = capacityOrders(state)
    const pending = pendingSuppliers(state)

    return (
        <Page>
            <Hello title="工作台" />
            <Kpis>
                <Kpi k="待产能确认" v={capacity.length} d={`${state.params.holdHours} 小时内`}
                    alert={capacity.length > 0} />
                <Kpi k="抢单池在挂" v={openPkgs(state).length} d="个派单包" />
                <Kpi k="询价单" v={state.db.rfqs.length} d="累计" />
                <Kpi k="待考察供应商" v={pending.length} d="已提交材料" alert={pending.length > 0} />
            </Kpis>

            <Card>
                <CardHead title="待处理" />
                {capacity.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>订单</th><th>客户</th><th className="n">行数</th>
                                    <th className="n">金额</th><th>已锁定</th><th />
                                </tr>
                            </thead>
                            <tbody>
                                {capacity.map((o) => {
                                    const ps = pkgsOf(state, o.id)
                                    const lock = ps.filter((p) => p.status === 'taken').length
                                    return (
                                        <tr className="clk" key={o.id} onClick={() => navigate('/ops/dispatch')}>
                                            <td><span className="m">{o.id}</span></td>
                                            <td className="t1">{findCompany(state, o.companyId)?.name}</td>
                                            <td className="n">{o.items.length}</td>
                                            <td className="n">{money(orderTotal(state, o))}</td>
                                            <td>
                                                <Pill tone={lock === ps.length ? 'ok' : 'wa'}>
                                                    {lock} / {ps.length}
                                                </Pill>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <button className="btn sm pri" type="button">去派单管理</button>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                ) : (
                    <CardBody><Empty text="暂时没有待处理的单" /></CardBody>
                )}
            </Card>
        </Page>
    )
}
