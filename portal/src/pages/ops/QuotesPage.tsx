/**
 * 内部看报价 —— 唯一能同时看到对客价和供应商目标价的地方，因此也是唯一能看毛利率的地方。
 *
 * ★ 毛利率用报价单里的**快照**算（目标价、汇率都是估价那一刻存死的），
 *   不读当前参数 —— 参数后来改了，历史单据的毛利不该跟着变（CLAUDE.md §10 C2）。
 *
 * ★ 上面一块是停在「待估价」的订单：系数没设全或材料没配价就估不出来，
 *   卡在哪一项这里说清楚 —— 不然单子无声地停着，没人知道为什么。
 */

import { Link } from 'react-router-dom'
import { Banner, Card, CardBody, CardHead, Empty, Hello, Page, pill, TableWrap } from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { findCompany } from '../../mock/actions'
import { M, money } from '../../mock/format'
import { num, pricingBlockers } from '../../mock/params'
import { QT_ST } from '../customer/status'

export function OpsQuotesPage() {
    const { state } = useMock()
    const quotes = state.db.quotes
    const stuck = state.db.orders.filter((o) => o.status === 'pricing')

    return (
        <Page>
            <Hello title="报价" />
            {stuck.length > 0 && (
                <Card style={{ marginBottom: 16 }}>
                    <CardHead title="待估价" />
                    <CardBody>
                        {stuck.map((o) => {
                            const blockers = pricingBlockers(state.rates, state.params, o.parts)
                            return (
                                <Banner key={o.id} tone={blockers.length ? 'wa' : 'in'} style={{ marginBottom: 8 }}>
                                    <b>{o.id}</b> · {findCompany(state, o.companyId)?.name} · {o.parts.length} 个零件
                                    {blockers.length
                                        ? <> —— 估不出来：{blockers.join('；')}。
                                            <Link to="/ops/rates" style={{ marginLeft: 6 }}>去定价参数 →</Link></>
                                        : ' —— 参数齐备，估价中。'}
                                </Banner>
                            )
                        })}
                    </CardBody>
                </Card>
            )}
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
                                    const target = q.items.reduce((a, i) => a + i.target * num(i.qty), 0)
                                    const revenue = q.total * q.fx
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
