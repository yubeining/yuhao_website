/**
 * 订单详情 —— **整条链都在这一页推进**。
 *
 *   草稿中    往里加零件，每个零件传自己的图纸
 *   ↓ 发布订单（草稿变正式）
 *   待估价 → 已估价
 *   ↓ 确认价格（在报价页）
 *   待发布
 *   ↓ 发布到订单市场
 *   已发布 → 已接单 → 待生产 → 生产中 → 生产完成 → 物流配送中
 *
 * ★ 两个「发布」不是一回事：前一个是草稿转正式，后一个是挂到订单市场。
 *
 * ★ 零件建在订单里面，图纸挂在零件上。三层从属：订单 → 零件 → 图纸。
 *
 * ★ 缺版本或材料的零件照样能留在订单里，只是不进这一次的报价 ——
 *   真实客户清单里本来就没有这两列（设计文档 9 §3）。
 */

import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Input } from '../../components/form'
import {
    Banner, Bar, BarLabel, Card, CardBody, CardFoot, CardHead, Empty, Fields, Fld,
    Hello, Page, Pill, pill, TableWrap,
} from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import {
    orderReady, partStat, removePart, submitOrder, updateOrder,
} from '../../mock/actions'
import { X, money, sum } from '../../mock/format'
import { num } from '../../mock/params'
import { myOrders, progress, quotesOf } from '../../mock/selectors'
import { EXEC_ST, isPublished, ORD_ST, PART_ST } from './status'

export function OrderDetailPage() {
    const { state, act } = useMock()
    const navigate = useNavigate()
    const { id } = useParams()
    const order = myOrders(state).find((o) => o.id === id)
    const [err, setErr] = useState<string | null>(null)

    if (!order) return <Navigate to="/customer/orders" replace />

    const draft = order.status === 'draft'
    const quotes = quotesOf(state, order.id)
    const stats = order.parts.map(partStat)
    const ready = stats.filter((s) => s === 'ready').length
    const notReady = stats.filter((s) => s !== 'ready').length
    const canSubmit = orderReady(order)
    const published = isPublished(order.status)
    const quotedTotal = quotes.reduce((a, q) => a + q.total, 0)

    const submit = () => {
        if (!order.parts.length) return setErr('请先录入零件')
        if (!canSubmit) return setErr(`还有 ${notReady} 个零件信息不全，补齐后方可发布`)
        act((s) => submitOrder(s, order.id))
    }

    return (
        <Page>
            <Hello
                back={<Link className="btn sm qui" to="/customer/orders" style={{ margin: '0 0 6px -9px' }}>← 我的订单</Link>}
                title={order.title}
                sub={order.id}
                right={
                    <>
                        {pill(ORD_ST[order.status])}
                        {draft && (
                            <Link className="btn pri" to={`/customer/orders/${order.id}/parts/new`}>
                                ＋ 添加零件
                            </Link>
                        )}
                    </>
                }
            />

            {err && <Banner tone="wa" style={{ marginBottom: 14 }}>{err}</Banner>}

            {draft && notReady > 0 && (
                <Banner tone="wa" style={{ marginBottom: 14 }}>
                    {notReady} 个零件信息不全，整单暂不可发布。报价按订单出具，需全部零件齐备。
                </Banner>
            )}
            {order.status === 'pricing' && (
                <Banner tone="in" style={{ marginBottom: 14 }}>
                    订单已提交，平台估价中。完成后会在这里给出报价。
                </Banner>
            )}
            {order.status === 'toPublish' && (
                <Banner tone="in" style={{ marginBottom: 14 }}>
                    价格已确认，平台正在安排生产。零件排进生产订单后这里会显示进度。
                </Banner>
            )}
            {order.status === 'quoted' && order.quoteId && (
                <Banner tone="wa" style={{ marginBottom: 14 }}>
                    报价已生成，确认价格后由平台安排生产。
                    <Link to={`/customer/quotes/${order.quoteId}`} style={{ marginLeft: 8 }}>去看报价 →</Link>
                </Banner>
            )}
            {order.status === 'toPublish' && (
                <Banner tone="in" style={{ marginBottom: 14 }}>
                    价格已确认。发布到订单市场后，供应商按零件分别接单。
                </Banner>
            )}

            <Card style={{ marginBottom: 16 }}>
                <CardHead title="订单信息" />
                <CardBody>
                    <Fields>
                        <Fld k="零件数" v={order.parts.length} mono />
                        <Fld k="总件数" v={sum(order.parts, (p) => num(p.qty))} mono />
                        <Fld k="报价金额" v={quotedTotal ? money(quotedTotal) : X} mono />
                        <Fld k="建单日期" v={order.at} mono />
                        <Fld k="交期要求" v={
                            draft
                                ? <Input value={order.want} placeholder="天"
                                    onChange={(v) => act((s) => updateOrder(s, order.id, { want: v }))} />
                                : (order.want ? `${order.want} 天` : X)
                        } />
                    </Fields>
                    {published && (
                        <div style={{ borderTop: '1px solid var(--line)', marginTop: 18, paddingTop: 16 }}>
                            <BarLabel left={<>整单进度</>} right={`${progress(order)}%`} />
                            <Bar pct={progress(order)} />
                        </div>
                    )}
                </CardBody>
                {/* ★★ 这里以前有个「发布到订单市场」按钮，是错的：
                    零件怎么组成生产订单、什么时候放给供应商看，是我方运营的判断，
                    不是客户的动作。客户确认的只是价格（见 mock/actions.publishProd）。 */}
            </Card>

            <Card>
                <CardHead
                    title={`零件 ${order.parts.length} 个`}
                    right={
                        <>
                            {ready > 0 && <Pill tone="ok">{ready} 可报价</Pill>}
                            {notReady > 0 && <Pill tone="wa">{notReady} 待补齐</Pill>}
                        </>
                    }
                />
                {order.parts.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th className="n">#</th>
                                    <th>图号</th><th>名称</th><th>版本</th><th>材料</th>
                                    <th className="n">数量</th><th className="n">图纸</th>
                                    <th className="n">单价</th>
                                    <th>{published ? '产能' : '状态'}</th>
                                    <th />
                                </tr>
                            </thead>
                            <tbody>
                                {order.parts.map((p, i) => (
                                    <tr key={p.id} className="clk"
                                        onClick={() => navigate(`/customer/orders/${order.id}/parts/${p.id}`)}>
                                        <td className="n">{i + 1}</td>
                                        <td><span className="m">{p.no || X}</span></td>
                                        <td className="t1">{p.name || X}</td>
                                        <td>
                                            <span className="m">v{p.version}</span>
                                            {p.customerRev && <div className="t2">客户标记 {p.customerRev}</div>}
                                        </td>
                                        <td>{p.mat || X}</td>
                                        <td className="n">{p.qty || X}</td>
                                        <td className="n">{p.files.length || X}</td>
                                        <td className="n">{p.unit !== undefined ? money(p.unit) : X}</td>
                                        <td>
                                            {!published ? pill(PART_ST[stats[i]])
                                                : p.dropped ? <Pill tone="ba">已退回</Pill>
                                                    : (
                                                        <>
                                                            {pill(EXEC_ST[p.st || 'waiting'])}
                                                            {p.st === 'producing' && (
                                                                <div className="t2">{num(p.done)} / {num(p.qty)} 件</div>
                                                            )}
                                                        </>
                                                    )}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            {draft ? (
                                                <button className="btn qui sm" type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        act((s) => removePart(s, order.id, p.id))
                                                    }}>
                                                    删除
                                                </button>
                                            ) : (
                                                <span style={{ color: 'var(--faint)' }}>›</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                ) : (
                    <CardBody>
                        <Empty
                            text="暂无零件"
                            sub="录入零件后可发布订单，进入估价"
                            action={<Link className="btn pri" to={`/customer/orders/${order.id}/parts/new`}>
                                ＋ 录入零件
                            </Link>}
                        />
                    </CardBody>
                )}
                {draft && order.parts.length > 0 && (
                    <CardFoot
                        left={<Link className="btn" to={`/customer/orders/${order.id}/parts/new`}>＋ 添加零件</Link>}
                        right={
                            <button className="btn pri" type="button" onClick={submit} disabled={!canSubmit}>
                                {canSubmit ? `发布订单（${ready} 个零件）→` : `还差 ${notReady} 个零件`}
                            </button>
                        }
                    />
                )}
            </Card>

            {quotes.length > 0 && (
                <Card style={{ marginTop: 16 }}>
                    <CardHead title="报价" />
                    <CardBody flush>
                        <TableWrap>
                            <tbody>
                                {quotes.map((q) => (
                                    <tr className="clk" key={q.id}
                                        onClick={() => navigate(`/customer/quotes/${q.id}`)}>
                                        <td><span className="m">{q.id}</span></td>
                                        <td className="n">{q.items.length} 个零件</td>
                                        <td className="n"><b>{money(q.total)}</b></td>
                                        <td>{pill(q.status === 'open' ? ['wa', '待确认'] : ['ok', '已确认'])}</td>
                                        <td style={{ textAlign: 'right', color: 'var(--faint)' }}>›</td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                </Card>
            )}
        </Page>
    )
}
