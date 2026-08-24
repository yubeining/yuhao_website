/**
 * 客户概览。
 *
 * ★ 版面顺序是「待你处理的 → 进行中的」。待确认报价用行动卡放最上面，
 *   因为它是唯一一件**只有客户能推进**的事 —— 报价卡着，整条链就停了。
 */

import { Link, useNavigate } from 'react-router-dom'
import {
    Bar, Card, CardBody, CardHead, Empty, Hello, Page, Pill, pill, TableWrap,
} from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { currentUser } from '../../mock/actions'
import { money, sum } from '../../mock/format'
import { num } from '../../mock/params'
import { myOrders, myQuotes, orderTotal, progress } from '../../mock/selectors'
import { ORD_ST } from './status'

export function CustomerHomePage() {
    const { state } = useMock()
    const navigate = useNavigate()
    const user = currentUser(state)
    const openQuotes = myQuotes(state).filter((q) => q.status === 'open')
    const live = myOrders(state).filter((o) => o.status !== 'shipping')

    return (
        <Page>
            <Hello
                title={`你好，${user?.name ?? ''}`}
                right={<Link className="btn pri" to="/customer/orders">＋ 新建订单</Link>}
            />

            {openQuotes.length > 0 && (
                <div className="acts">
                    {openQuotes.map((q) => (
                        <div className="actcard" key={q.id}>
                            <div className="ah">
                                <span className="at">一份报价待你确认</span>
                                <span className="sp" />
                                <Pill tone="in">有效期至 {q.valid}</Pill>
                            </div>
                            <div className="ad">
                                {q.items.length} 行 · {sum(q.items, (i) => num(i.qty))} 件
                            </div>
                            <div className="af">
                                <span className="amt2">{money(q.total)}</span>
                                <span className="sp" />
                                <Link className="btn" to={`/customer/quotes/${q.id}`}>查看明细</Link>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Card>
                <CardHead title="进行中的订单" right={<Pill tone="ne" dot={false}>{live.length} 单</Pill>} />
                {live.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>订单号</th><th className="n">零件</th><th className="n">金额</th>
                                    <th>进度</th><th>状态</th>
                                </tr>
                            </thead>
                            <tbody>
                                {live.map((o) => (
                                    <tr className="clk" key={o.id} onClick={() => navigate(`/customer/orders/${o.id}`)}>
                                        <td><span className="m">{o.id}</span></td>
                                        <td className="n">{o.parts.length}</td>
                                        <td className="n">{money(orderTotal(state, o))}</td>
                                        <td style={{ minWidth: 110 }}><Bar pct={progress(o)} /></td>
                                        <td>{pill(ORD_ST[o.status])}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                ) : (
                    <CardBody>
                        <Empty text="还没有订单"
                            action={<Link className="btn pri" to="/customer/orders">建第一个订单</Link>} />
                    </CardBody>
                )}
            </Card>
        </Page>
    )
}
