/**
 * 报价详情 —— 客户在这里按下「接受报价」。
 *
 * ★ 接受不等于合同成立。接受之后进产能确认期，每一行拆成派单包去抢单，
 *   全部抢到才成立（见 actions.acceptQuote / syncOrder）。
 *   这一点必须在按钮旁边讲明白，不能只写在服务条款里。
 */

import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import {
    Banner, Card, CardBody, CardFoot, CardHead, Cols, Fields, Fld, Hello, Page, pill, Stack, TableWrap,
} from '../../components/ui'
import type { PillSpec } from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { acceptQuote } from '../../mock/actions'
import { money } from '../../mock/format'
import { myQuotes } from '../../mock/selectors'
import { QT_ST } from './status'

export function QuoteDetailPage() {
    const { state, actWith } = useMock()
    const navigate = useNavigate()
    const { id } = useParams()
    const quote = myQuotes(state).find((q) => q.id === id)
    if (!quote) return <Navigate to="/customer/quotes" replace />

    const order = state.db.orders.find((o) => o.quoteId === quote.id)
    const dropped = order ? order.items.filter((i) => i.st === 'dropped').length : 0

    /** 接受之后每一行的产能确认结果。没下单时不显示这一列。 */
    const lineState = (idx: number): PillSpec => {
        const it = order!.items[idx]
        return it.st === 'taken' || it.st === 'done'
            ? ['ok', '已锁定']
            : it.st === 'dropped'
                ? ['ba', '无人接单 · 已退回']
                : ['in', '确认中']
    }

    const accept = () => {
        const o = actWith((s) => acceptQuote(s, quote.id))
        if (o) navigate(`/customer/orders/${o.id}`)
    }

    return (
        <Page>
            <Hello
                back={<Link className="btn sm qui" to="/customer/quotes" style={{ margin: '0 0 6px -9px' }}>← 我的报价</Link>}
                title="报价详情" sub={quote.id}
                right={pill(QT_ST[quote.status])}
            />

            {dropped > 0 && (
                <Banner tone="wa" style={{ marginBottom: 18 }}>
                    {quote.items.length - dropped} 行已锁定产能，{dropped} 行无人接单已退回。
                </Banner>
            )}

            <Cols>
                <Stack>
                    <Card>
                        <CardHead title="报价明细" />
                        <CardBody flush>
                            <TableWrap>
                                <thead>
                                    <tr>
                                        <th className="n">行</th><th>零件</th><th className="n">数量</th>
                                        <th className="n">单价</th><th className="n">小计</th>
                                        {order && <th>产能确认</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {quote.items.map((i, k) => (
                                        <tr key={k}>
                                            <td className="n">{k + 1}</td>
                                            <td>
                                                <div className="t1">{i.no}</div>
                                                <div className="t2">Rev {i.rev} · {i.mat}</div>
                                            </td>
                                            <td className="n">{i.qty}</td>
                                            <td className="n">{money(i.unit)}</td>
                                            <td className="n"><b>{money(i.total)}</b></td>
                                            {order && <td>{pill(lineState(k))}</td>}
                                        </tr>
                                    ))}
                                </tbody>
                            </TableWrap>
                        </CardBody>
                        <CardFoot
                            left={<span style={{ fontSize: 13, color: 'var(--muted)' }}>合计</span>}
                            right={
                                <span style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700 }}>
                                    {money(quote.total)}
                                </span>
                            }
                        />
                    </Card>
                </Stack>

                <Stack>
                    <Card>
                        <CardHead title="条款" />
                        <CardBody>
                            <Fields>
                                <Fld k="贸易条款" v={quote.inco} />
                                <Fld k="交期" v={quote.lead} mono />
                                <Fld k="有效期至" v={quote.valid} mono />
                                <Fld k="对应询价" v={quote.rfqId} mono />
                            </Fields>
                            {quote.status === 'open' && (
                                <Banner tone="wa" style={{ marginTop: 16 }}>
                                    本报价以产能确认为准。接受后我们将在 {state.params.holdHours} 小时内确认产能，
                                    确认通过后合同成立。
                                </Banner>
                            )}
                        </CardBody>
                        {quote.status === 'open' ? (
                            <CardFoot
                                left={<button className="btn" type="button">谢绝</button>}
                                right={<button className="btn pri" type="button" onClick={accept}>接受报价</button>}
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
