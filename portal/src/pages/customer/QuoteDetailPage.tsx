/**
 * 报价详情 —— 客户在这里**确认价格**。
 *
 * ★ 确认的只是价格，**不是产能**。平台把零件组进生产订单、有供应商接单才算锁定。
 *   这一点必须写在按钮旁边，不能只写在服务条款里。
 *
 * ★ 这里不显示交期 —— 交期要等供应商排产才知道。
 *   有效期是真的：报价强制有效期（文档 3 护栏 1），默认天数文档 5 Q6 定了 15、可配置。
 */

import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import {
    Banner, Card, CardBody, CardFoot, CardHead, Cols, Fields, Fld, Hello, Page, pill, Stack, TableWrap,
} from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { confirmQuote } from '../../mock/actions'
import { money } from '../../mock/format'
import { myQuotes } from '../../mock/selectors'
import { QT_ST } from './status'

export function QuoteDetailPage() {
    const { state, actWith } = useMock()
    const navigate = useNavigate()
    const { id } = useParams()
    const quote = myQuotes(state).find((q) => q.id === id)
    if (!quote) return <Navigate to="/customer/quotes" replace />

    const order = state.db.orders.find((o) => o.id === quote.orderId)

    const confirm = () => {
        const o = actWith((s) => confirmQuote(s, quote.id))
        if (o) navigate(`/customer/orders/${o.id}`)
    }

    return (
        <Page>
            <Hello
                back={<Link className="btn sm qui" to="/customer/quotes" style={{ margin: '0 0 6px -9px' }}>← 我的报价</Link>}
                title="报价详情" sub={`${quote.id} · ${order?.title ?? ''}`}
                right={pill(QT_ST[quote.status])}
            />

            <Cols>
                <Stack>
                    <Card>
                        <CardHead title="报价明细" />
                        <CardBody flush>
                            <TableWrap>
                                <thead>
                                    <tr>
                                        <th className="n">#</th><th>零件</th><th className="n">数量</th>
                                        <th className="n">单价</th><th className="n">小计</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {quote.items.map((i, k) => (
                                        <tr key={k}>
                                            <td className="n">{k + 1}</td>
                                            <td>
                                                <div className="t1">{i.name}</div>
                                                <div className="t2">{i.no} · v{i.version}{i.customerRev ? ` · ${i.customerRev}` : ''} · {i.mat}</div>
                                            </td>
                                            <td className="n">{i.qty}</td>
                                            <td className="n">{money(i.unit)}</td>
                                            <td className="n"><b>{money(i.total)}</b></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </TableWrap>
                        </CardBody>
                        <CardFoot
                            left={<span style={{ fontSize: 13, color: 'var(--muted)' }}>合计</span>}
                            right={<span style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700 }}>
                                {money(quote.total)}
                            </span>}
                        />
                    </Card>
                </Stack>

                <Stack>
                    <Card>
                        <CardHead title="条款" />
                        <CardBody>
                            <Fields>
                                <Fld k="贸易条款" v={quote.inco} />
                                <Fld k="客户要求交期" v={quote.wantLead} mono />
                                <Fld k="有效期至" v={quote.valid} mono />
                                <Fld k="对应订单" v={quote.orderId} mono />
                            </Fields>
                            {quote.status === 'open' && (
                                <Banner tone="wa" style={{ marginTop: 16 }}>
                                    确认的是价格。产能要等平台安排生产、有供应商接单才算落实。
                                </Banner>
                            )}
                        </CardBody>
                        {quote.status === 'open' ? (
                            <CardFoot
                                left={<button className="btn" type="button">谢绝</button>}
                                right={<button className="btn pri" type="button" onClick={confirm}>确认价格</button>}
                            />
                        ) : order ? (
                            <CardFoot right={
                                <Link className="btn" to={`/customer/orders/${order.id}`}>查看订单 →</Link>
                            } />
                        ) : null}
                    </Card>
                </Stack>
            </Cols>
        </Page>
    )
}
