/**
 * 内部看报价 —— 唯一能同时看到对客价和供应商目标价的地方，因此也是唯一能看毛利率的地方。
 *
 * ★ 毛利率按**当前**定价参数实时算。这只在内部视图成立：
 *   对外发出的报价单必须用下单时的快照，绝不回头读配置（CLAUDE.md §10 C2）。
 *   这里是运营的经营分析视图，不是发给客户的单据。
 */

import { Card, CardBody, Empty, Hello, Page, pill, TableWrap } from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { findCompany } from '../../mock/actions'
import { M, money } from '../../mock/format'
import { targetTotal } from '../../mock/params'
import { QT_ST } from '../customer/status'

export function OpsQuotesPage() {
    const { state } = useMock()
    const quotes = state.db.quotes

    return (
        <Page>
            <Hello title="报价" />
            <Card>
                {quotes.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>报价单</th><th>客户</th><th className="n">行数</th>
                                    <th className="n">对客总额</th><th className="n">供应商目标价合计</th>
                                    <th className="n">预估毛利率</th><th>状态</th>
                                </tr>
                            </thead>
                            <tbody>
                                {quotes.map((q) => {
                                    const target = targetTotal(state.rates, state.params, q.items)
                                    const revenue = q.total * state.params.fx
                                    const gm = revenue ? Math.round(((revenue - target) / revenue) * 100) : 0
                                    return (
                                        <tr className="clk" key={q.id}>
                                            <td><span className="m">{q.id}</span></td>
                                            <td className="t1">{findCompany(state, q.companyId)?.name}</td>
                                            <td className="n">{q.items.length}</td>
                                            <td className="n">{money(q.total)}</td>
                                            <td className="n">¥ {M(target)}</td>
                                            <td className="n"><b>{gm}%</b></td>
                                            <td>{pill(QT_ST[q.status])}</td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                ) : (
                    <CardBody><Empty text="还没有报价" /></CardBody>
                )}
            </Card>
        </Page>
    )
}
