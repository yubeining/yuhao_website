/**
 * 订单详情。
 *
 * ★ 产能确认期和「部分行退回」这两件事必须用横幅顶在最上面。
 *   它们都是客户没预期的状态：下了单却还没成立、下了 4 行只做成 3 行。
 *   埋在表格里等他自己发现，等来的一定是电话。
 */

import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import {
    Banner, Bar, BarLabel, Card, CardBody, CardHead, Cols, Fields, Fld, Hello,
    Page, Pill, pill, Stack, TableWrap, Timeline,
} from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { money, sum } from '../../mock/format'
import { num } from '../../mock/params'
import { myOrders, orderTotal, progress } from '../../mock/selectors'
import { IT_ST, ORD_ST, ORD_STAGES } from './status'

export function OrderDetailPage() {
    const { state } = useMock()
    const navigate = useNavigate()
    const { id } = useParams()
    const order = myOrders(state).find((o) => o.id === id)
    if (!order) return <Navigate to="/customer/orders" replace />

    const dropped = order.items.filter((i) => i.st === 'dropped').length
    const live = order.items.filter((i) => i.st !== 'dropped')
    const pct = progress(order)

    /**
     * 随货单据清单。四项是合同里真实约定要给的东西，所以清单本身有依据。
     *
     * ★ 但**文件还不存在** —— 平台没有单据生成，也没有文件库。
     *   所以一律显示「待生成」，不按 stage 推断「已就绪」，也不给下载按钮。
     *   推断出来的「已就绪」会让客户去点一个下不到东西的按钮。
     */
    const DOCS = ['订单确认书', '材质证明', '出厂质检报告', '装箱单与箱唛']

    return (
        <Page>
            <Hello
                back={<Link className="btn sm qui" to="/customer/orders" style={{ margin: '0 0 6px -9px' }}>← 我的订单</Link>}
                title="订单详情" sub={order.id}
                right={pill(ORD_ST[order.status])}
            />

            {order.status === 'capacity' && (
                <Banner tone="wa" icon="◷" style={{ marginBottom: 18 }}>
                    正在确认产能，{state.params.holdHours} 小时内给出结果。确认通过后合同成立并开始生产；
                    未能确认的行会退回，不计费。
                </Banner>
            )}
            {dropped > 0 && (
                <Banner tone="wa" style={{ marginBottom: 18 }}>
                    {dropped} 行无人接单已退回，其余 {order.items.length - dropped} 行照常生产。
                </Banner>
            )}

            <Cols>
                <Stack>
                    <Card>
                        <CardHead title="订单信息" />
                        <CardBody>
                            <Fields>
                                <Fld k="零件行数" v={order.items.length} mono />
                                <Fld k="总件数" v={sum(order.items, (i) => num(i.qty))} mono />
                                <Fld k="金额" v={money(orderTotal(state, order))} mono />
                                <Fld k="贸易条款" v="EXW 指定仓库" />
                                <Fld k="下单日期" v={order.at} mono />
                                <Fld k="预计送达" v={order.eta} mono />
                            </Fields>
                            <div style={{ borderTop: '1px solid var(--line)', marginTop: 18, paddingTop: 16 }}>
                                <BarLabel
                                    left={
                                        <>
                                            已完成 <b>{sum(live, (i) => num(i.done))} / {sum(live, (i) => num(i.qty))}</b>
                                            {live.length < order.items.length && (
                                                <span style={{ color: 'var(--faint)' }}>
                                                    （不含已退回的 {order.items.length - live.length} 行）
                                                </span>
                                            )}
                                        </>
                                    }
                                    right={`${pct}%`}
                                />
                                <Bar pct={pct} />
                            </div>
                        </CardBody>
                    </Card>

                    <Card>
                        <CardHead title="零件明细"
                            right={<Pill tone="ne" dot={false}>{order.items.length} 行</Pill>} />
                        <CardBody flush>
                            <TableWrap>
                                <thead>
                                    <tr>
                                        <th className="n">行</th><th>零件</th><th>版本</th><th>材料</th>
                                        <th className="n">数量</th><th className="n">进度</th>
                                        <th>交付方式</th><th>状态</th><th />
                                    </tr>
                                </thead>
                                <tbody>
                                    {order.items.map((it, i) => (
                                        <tr key={i} className={`clk ${it.st === 'dropped' ? 'dim' : ''}`}
                                            onClick={() => navigate(`/customer/orders/${order.id}/lines/${i}`)}>
                                            <td className="n">{i + 1}</td>
                                            <td className="t1">{it.no}</td>
                                            <td><span className="m">{it.rev}</span></td>
                                            <td>{it.mat}</td>
                                            <td className="n">{it.qty}</td>
                                            <td className="n">{it.done} / {it.qty}</td>
                                            <td>
                                                <Pill tone={it.ship === '分批发运' ? 'in' : 'ne'} dot={false}>
                                                    {it.ship}
                                                </Pill>
                                            </td>
                                            <td>{pill(IT_ST[it.st], IT_ST.pending)}</td>
                                            <td style={{ textAlign: 'right', color: 'var(--faint)' }}>›</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </TableWrap>
                        </CardBody>
                    </Card>
                </Stack>

                <Stack>
                    <Card>
                        <CardHead title="进度" />
                        <CardBody>
                            <Timeline stages={ORD_STAGES} cur={order.stage}
                                meta={(i) => (i < order.stage ? '已完成' : i === order.stage ? '进行中' : '待开始')} />
                        </CardBody>
                    </Card>

                    <Card>
                        <CardHead title="随货单据" />
                        <CardBody flush>
                            <TableWrap>
                                <tbody>
                                    {DOCS.map((n) => (
                                        <tr key={n} className="dim">
                                            <td className="t1">{n}</td>
                                            <td><Pill tone="ne">待生成</Pill></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </TableWrap>
                        </CardBody>
                    </Card>
                </Stack>
            </Cols>
        </Page>
    )
}
