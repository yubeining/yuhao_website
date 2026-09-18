/**
 * 派单管理 —— **运营在这里把客户订单的零件重新组成生产订单**。
 *
 * ★★ 客户订单和生产订单不是一个概念。
 *   客户订单是客户表达「我要这些」；生产订单是我方表达「这一批交给一家做」。
 *   一个生产订单可以装多个客户订单的零件，一个客户订单的零件也能分散进多个生产订单。
 *   **中间怎么组是运营的判断**，不是系统按客户下单方式自动推出来的。
 *
 * ★ 发布是我方的动作，不是客户的：供应商是我们的资源，目标价是内部算的，
 *   什么时候放出去给供应商看由运营决定。客户那边确认的只是价格。
 *
 * ★ 这一页只管「组」和「挂」。挂出去之后一个生产订单的下场
 *   （抢单 / 排产 / 报工 / 开票）在它自己的详情页里看。
 */

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
    Card, CardBody, CardFoot, CardHead, Empty, Hello, Page, Pill, PrototypeBanner, TableWrap,
} from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { addProdLine, createProd, findCompany, freeParts } from '../../mock/actions'
import { M, X } from '../../mock/format'
import type { Prod } from '../../mock/types'

export const PROD_ST = (st: Prod['status']) =>
    st === 'draft' ? <Pill tone="ne">组包中</Pill>
        : st === 'open' ? <Pill tone="in">在抢</Pill>
            : st === 'dropped' ? <Pill tone="ba">已退回</Pill>
                : st === 'done' ? <Pill tone="ok">已完工</Pill>
                    : <Pill tone="ok">已接单</Pill>

export function OpsDispatchPage() {
    const { state, actWith } = useMock()
    const navigate = useNavigate()
    /** 池子里勾中的零件。key = partId */
    const [picked, setPicked] = useState<Record<string, boolean>>({})

    const free = freeParts(state)
    const prods = state.db.prods
    const chosen = free.filter((f) => picked[f.part.id])

    /** 把勾中的零件组成一个新的生产订单，然后进它的详情页接着组 */
    const compose = () => {
        const id = actWith((s) => {
            const d = createProd(s)
            chosen.forEach((f) => addProdLine(s, d.id, f.order.id, f.part.id))
            return d.id
        })
        setPicked({})
        navigate(`/ops/dispatch/${id}`)
    }

    return (
        <Page>
            <PrototypeBanner />
            <Hello title="派单管理" sub="把客户订单的零件组成生产订单，再挂到订单市场" />

            <Card style={{ marginBottom: 18 }}>
                <CardHead
                    title="未安排的零件"
                    rid={free.length ? `${free.length} 个待安排` : undefined}
                    right={free.length > 0
                        ? <button className="btn sm qui" type="button"
                            onClick={() => setPicked(
                                Object.fromEntries(free.map((f) => [f.part.id, true])),
                            )}>
                            全选
                        </button>
                        : undefined}
                />
                {free.length ? (
                    <>
                        <CardBody flush>
                            <TableWrap>
                                <thead>
                                    <tr>
                                        <th style={{ width: 36 }} />
                                        <th>零件</th><th>客户 / 来源订单</th><th>规格</th>
                                        <th className="n">数量</th><th className="n">目标价</th>
                                        <th className="n">小计</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {free.map(({ order, part, target }) => (
                                        <tr key={part.id} className="clk"
                                            onClick={() => setPicked((d) => ({ ...d, [part.id]: !d[part.id] }))}>
                                            <td>
                                                <input type="checkbox" checked={!!picked[part.id]} readOnly />
                                            </td>
                                            <td>
                                                <div className="t1">{part.name}</div>
                                                {/* ★ 内部看得到图号；生产订单的行上刻意不存它（文档 7 §8） */}
                                                <div className="t2 m">{part.no} · v{part.version}</div>
                                            </td>
                                            <td>
                                                <div className="t1">{findCompany(state, order.companyId)?.name}</div>
                                                <div className="t2 m">{order.id}</div>
                                            </td>
                                            <td>{part.mat || X}{part.surf ? ` · ${part.surf}` : ''}</td>
                                            <td className="n">{part.qty}</td>
                                            <td className="n">¥ {M(target)}</td>
                                            <td className="n">¥ {M(target * Number(part.qty))}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </TableWrap>
                        </CardBody>
                        <CardFoot
                            left={<span className="t2">
                                已选 {chosen.length} 个零件
                                {chosen.length > 0 && ` · 合计 ¥ ${M(chosen.reduce((a, f) => a + f.target * Number(f.part.qty), 0))}`}
                                {/* ★ 跨客户提示：组进同一个生产订单意味着一家供应商同时做几个客户的活 */}
                                {new Set(chosen.map((f) => f.order.companyId)).size > 1
                                    && ` · 跨 ${new Set(chosen.map((f) => f.order.companyId)).size} 个客户`}
                            </span>}
                            right={
                                <button className="btn pri" type="button"
                                    disabled={!chosen.length} onClick={compose}>
                                    组成生产订单
                                </button>
                            }
                        />
                    </>
                ) : (
                    <CardBody>
                        <Empty text="没有待安排的零件"
                            sub="客户确认报价之后，零件会出现在这里等运营组包" />
                    </CardBody>
                )}
            </Card>

            <Card>
                <CardHead title="生产订单" rid={prods.length ? `${prods.length} 单` : undefined} />
                {prods.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>生产订单</th><th className="n">行数</th><th>牵涉客户</th>
                                    <th className="n">金额</th><th>供应商</th><th>抢单截止</th><th>状态</th>
                                </tr>
                            </thead>
                            <tbody>
                                {prods.map((d) => {
                                    const custs = [...new Set(d.lines.map((l) =>
                                        state.db.orders.find((o) => o.id === l.orderId)?.companyId))]
                                    return (
                                        <tr className="clk" key={d.id}>
                                            <td><Link className="m" to={`/ops/dispatch/${d.id}`}>{d.id}</Link></td>
                                            <td className="n">{d.lines.length}</td>
                                            <td>
                                                {custs.length === 1
                                                    ? findCompany(state, custs[0])?.name
                                                    : <>{custs.length} 个客户</>}
                                            </td>
                                            <td className="n">¥ {M(d.total)}</td>
                                            <td>{d.sup ? findCompany(state, d.sup)?.name : <span className="t2">—</span>}</td>
                                            <td className="n">{d.exp ?? X}</td>
                                            <td>{PROD_ST(d.status)}</td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                ) : (
                    <CardBody><Empty text="还没有生产订单" sub="从上面的零件池里选几个，组第一个" /></CardBody>
                )}
            </Card>
        </Page>
    )
}
