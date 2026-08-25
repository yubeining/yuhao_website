/**
 * 内部看报价 —— 唯一能同时看到对客价和供应商目标价的地方，因此也是唯一能看毛利率的地方。
 *
 * ★ 毛利率用报价单里的**快照**算（基准成本、目标价、汇率都是估价那一刻存死的），
 *   不读当前参数 —— 参数后来改了，历史单据的毛利不该跟着变（CLAUDE.md §10 C2）。
 *
 * ★ 上面一块是还没出价的单子。**每一条都能点进报价工作台**，
 *   在那里跑 AI、人工定价、出报价单。这一页只负责说清「谁在等、等什么」。
 *
 * ★ 「等什么」分两种，写清楚是因为处理方式完全不同：
 *   系数没配 → 去定价参数页配一次，所有单子一起解开；
 *   零件没定价 → 只能一单一单进去定。
 */

import { Link } from 'react-router-dom'
import { Banner, Card, CardBody, CardHead, Empty, Hello, Page, pill, TableWrap } from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { findCompany } from '../../mock/actions'
import { AI_MIN_CONF } from '../../mock/ai'
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
                    <CardHead title="待出价" rid={`${stuck.length} 单`} />
                    <CardBody>
                        {stuck.map((o) => {
                            const blockers = pricingBlockers(state.params, o.parts)
                            const noBase = o.parts.filter((p) => p.base == null)
                            // AI 估过但置信度不够 —— 这些是明确在等人工的（文档 8 §5）
                            const toManual = noBase.filter((p) => p.ai && !p.ai.blocked)
                            return (
                                <Banner key={o.id} tone={blockers.length ? 'wa' : 'in'} style={{ marginBottom: 8 }}>
                                    <b>{o.id}</b> · {findCompany(state, o.companyId)?.name} · {o.parts.length} 个零件
                                    {blockers.length === 0
                                        ? ' —— 零件已全部定价，可以出报价单。'
                                        : noBase.length === 0
                                            ? ` —— ${blockers.join('；')}。`
                                            : toManual.length
                                                ? ` —— ${noBase.length} 个零件待定价，其中 ${toManual.length} 个 AI 置信度低于 ${AI_MIN_CONF * 100}%，需要人工。`
                                                : ` —— ${noBase.length} 个零件待定价。`}
                                    <Link to={`/ops/quotes/${o.id}`} style={{ marginLeft: 6 }}>去报价工作台 →</Link>
                                </Banner>
                            )
                        })}
                    </CardBody>
                </Card>
            )}
            <Card>
                <CardHead title="已出报价" />
                {quotes.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>报价单</th><th>客户</th><th className="n">行数</th>
                                    <th>定价来源</th>
                                    <th className="n">对客总额</th><th className="n">供应商目标价合计</th>
                                    <th className="n">预估毛利率</th><th>状态</th>
                                </tr>
                            </thead>
                            <tbody>
                                {quotes.map((q) => {
                                    const target = q.items.reduce((a, i) => a + i.target * num(i.qty), 0)
                                    const revenue = q.total * q.fx
                                    const gm = revenue ? Math.round(((revenue - target) / revenue) * 100) : 0
                                    // ★ 一张单里两种来源都有很常见：AI 报得出的走 AI，报不出的人工补
                                    const manual = q.items.filter((i) => i.baseSrc === 'manual').length
                                    return (
                                        <tr className="clk" key={q.id}>
                                            <td><Link className="m" to={`/ops/quotes/${q.orderId}`}>{q.id}</Link></td>
                                            <td className="t1">{findCompany(state, q.companyId)?.name}</td>
                                            <td className="n">{q.items.length}</td>
                                            <td>
                                                {manual === 0 ? pill(['in', '全部 AI'])
                                                    : manual === q.items.length ? pill(['ok', '全部人工'])
                                                        : pill(['ok', `人工 ${manual} / ${q.items.length}`])}
                                            </td>
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
