/**
 * 生产订单详情 —— 组包、挂出去、以及挂出去之后看它的下场。
 *
 * ★★ 一个生产订单可以装多个客户订单的零件。所以这一页里到处要提醒
 *   「这一行是谁的」—— 内部视角必须能一眼回溯到客户和图号。
 *   **供应商那边看到的同一批行是脱敏的**（只有零件名，没有图号、没有客户）。
 *
 * ★ 草稿态才能加减行。挂出去之后行就定死了 —— 供应商是照着挂出来的那一版抢的，
 *   抢完再改行等于换了一份合同的标的（CLAUDE.md §10 C2）。
 *
 * ★ 退回和调价重挂都是整单的：一个生产订单一个供应商，
 *   没有「只退其中一行」这回事 —— 要拆开就是重新组两个包。
 */

import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Input } from '../../components/form'
import {
    Banner, Bar, Card, CardBody, CardFoot, CardHead, Empty, Fields, Fld, Hello, Page, PrototypeBanner, TableWrap,
} from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import {
    addProdLine, deleteProd, dropProd, findCompany, freeParts,
    publishProd, removeProdLine, repost,
} from '../../mock/actions'
import { M, X } from '../../mock/format'
import { contractOf } from '../../mock/selectors'
import { PROD_ST } from './DispatchPage'
import { EXEC_ST } from '../customer/status'

export function OpsProdPage() {
    const { state, act } = useMock()
    const navigate = useNavigate()
    const { id } = useParams()
    const [pct, setPct] = useState('')

    const prod = state.db.prods.find((d) => d.id === id)
    if (!prod) return <Navigate to="/ops/dispatch" replace />

    const draft = prod.status === 'draft'
    const free = freeParts(state)
    const ct = contractOf(state, prod.id)
    const custs = [...new Set(prod.lines.map((l) =>
        state.db.orders.find((o) => o.id === l.orderId)?.companyId))]
    const doneQty = prod.lines.reduce((a, l) => a + (l.done ?? 0), 0)
    const totalQty = prod.lines.reduce((a, l) => a + l.qty, 0)

    /** 行所属的客户订单和零件 —— 内部视角要看到图号 */
    const src = (orderId: string, partId: string) => {
        const o = state.db.orders.find((x) => x.id === orderId)
        return { order: o, part: o?.parts.find((x) => x.id === partId) }
    }

    return (
        <Page>
            <PrototypeBanner />
            <Hello
                back={<Link className="btn sm qui" to="/ops/dispatch" style={{ margin: '0 0 6px -9px' }}>← 派单管理</Link>}
                title={prod.id}
                sub={custs.length === 1
                    ? `${findCompany(state, custs[0])?.name ?? X} · ${prod.lines.length} 行`
                    : `${custs.length} 个客户 · ${prod.lines.length} 行`}
                right={PROD_ST(prod.status)}
            />

            {custs.length > 1 && (
                <Banner tone="in" style={{ marginBottom: 14 }}>
                    这一单装着 <b>{custs.length} 个客户</b>的零件。交期、质量、发货都按行分别对客户负责 ——
                    对供应商是一单，对客户不是。
                </Banner>
            )}
            {prod.status === 'dropped' && (
                <Banner tone="wa" style={{ marginBottom: 14 }}>
                    已退回。行上的零件回到了未安排的池子，可以换一种组法重新组包。
                </Banner>
            )}

            <Card style={{ marginBottom: 16 }}>
                <CardHead
                    title="订单行"
                    rid={`合计 ¥ ${M(prod.total)}`}
                    right={prod.status === 'taken' || prod.status === 'done'
                        ? <span className="t2">{doneQty} / {totalQty} 件已完成</span>
                        : undefined}
                />
                {prod.lines.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>零件</th><th>客户 / 来源订单</th><th>规格</th>
                                    <th className="n">数量</th><th className="n">目标价</th><th className="n">小计</th>
                                    <th>交期要求</th>
                                    {!draft && <th>执行</th>}
                                    {draft && <th />}
                                </tr>
                            </thead>
                            <tbody>
                                {prod.lines.map((l) => {
                                    const { order, part } = src(l.orderId, l.partId)
                                    return (
                                        <tr key={l.partId}>
                                            <td>
                                                <div className="t1">{l.partName}</div>
                                                {/* ★ 内部能看图号，行上刻意不存它 —— 从 orderId + partId 回溯 */}
                                                <div className="t2 m">{part?.no ?? X}{part ? ` · v${part.version}` : ''}</div>
                                            </td>
                                            <td>
                                                <div className="t1">{findCompany(state, order?.companyId)?.name ?? X}</div>
                                                <div className="t2 m">{l.orderId}</div>
                                            </td>
                                            <td>{l.mat || X}{l.surf ? ` · ${l.surf}` : ''}</td>
                                            <td className="n">{l.qty}</td>
                                            <td className="n">¥ {M(l.target)}</td>
                                            <td className="n">¥ {M(l.total)}</td>
                                            <td>{l.wantLead}</td>
                                            {!draft && (
                                                <td>
                                                    {part?.st ? EXEC_ST[part.st][1] : X}
                                                    {(l.done ?? 0) > 0 && (
                                                        <div className="t2">{l.done} / {l.qty} 件</div>
                                                    )}
                                                    {l.delivered && <div className="t2">已发货 {l.delivered}</div>}
                                                </td>
                                            )}
                                            {draft && (
                                                <td style={{ textAlign: 'right' }}>
                                                    <button className="btn qui sm" type="button"
                                                        onClick={() => act((s) => removeProdLine(s, prod.id, l.partId))}>
                                                        移出
                                                    </button>
                                                </td>
                                            )}
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                ) : (
                    <CardBody><Empty text="还没有行" sub="从下面的未安排零件里加进来" /></CardBody>
                )}

                {draft && (
                    <CardFoot
                        left={
                            <button className="btn qui" type="button"
                                onClick={() => { act((s) => deleteProd(s, prod.id)); navigate('/ops/dispatch') }}>
                                删除这个生产订单
                            </button>
                        }
                        right={
                            <button className="btn pri" type="button" disabled={!prod.lines.length}
                                onClick={() => act((s) => publishProd(s, prod.id))}>
                                挂到订单市场
                            </button>
                        }
                    />
                )}
                {prod.status === 'open' && (
                    <CardFoot
                        left={<span className="t2">
                            抢单截止 {prod.exp ?? X}
                            {prod.reprice ? ` · 已调价重挂 ${prod.reprice} 次` : ''}
                        </span>}
                        right={
                            <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                                {/* ★ 调的是统一涨幅不是某一个价：一单很多行，逐行改价等于重组一遍包 */}
                                <Input value={pct} placeholder="上调 %" style={{ width: 96, textAlign: 'right' }}
                                    onChange={setPct} />
                                <button className="btn qui" type="button" disabled={!pct}
                                    onClick={() => { act((s) => repost(s, prod.id, pct)); setPct('') }}>
                                    调价重挂
                                </button>
                                <button className="btn qui" type="button"
                                    onClick={() => act((s) => dropProd(s, prod.id))}>
                                    退回
                                </button>
                            </div>
                        }
                    />
                )}
            </Card>

            {!draft && prod.status !== 'dropped' && (
                <Card style={{ marginBottom: 16 }}>
                    <CardHead title="承接" />
                    <CardBody>
                        <Fields>
                            <Fld k="供应商" v={prod.sup ? findCompany(state, prod.sup)?.name ?? X : '还没人抢'} />
                            <Fld k="抢单时刻" v={prod.tookAt ?? X} mono />
                            <Fld k="合同" v={ct ? `${ct.id} · ${ct.status === 'signed' ? '已签' : '待签'}` : X} mono />
                            <Fld k="排产" v={prod.scheduled ? '已确认' : '未确认'} />
                            <Fld k="付款周期" v={prod.pay} />
                            <Fld k="开票" v={prod.invoice ? '已上传' : '未上传'} />
                        </Fields>
                        {totalQty > 0 && (
                            <div style={{ marginTop: 12 }}>
                                <Bar pct={Math.round((doneQty / Math.max(1, totalQty)) * 100)} />
                            </div>
                        )}
                    </CardBody>
                </Card>
            )}

            {draft && (
                <Card>
                    <CardHead title="未安排的零件" rid={free.length ? `${free.length} 个` : undefined} />
                    {free.length ? (
                        <CardBody flush>
                            <TableWrap>
                                <thead>
                                    <tr>
                                        <th>零件</th><th>客户 / 来源订单</th><th>规格</th>
                                        <th className="n">数量</th><th className="n">目标价</th><th />
                                    </tr>
                                </thead>
                                <tbody>
                                    {free.map(({ order, part, target }) => (
                                        <tr key={part.id}>
                                            <td>
                                                <div className="t1">{part.name}</div>
                                                <div className="t2 m">{part.no} · v{part.version}</div>
                                            </td>
                                            <td>
                                                <div className="t1">{findCompany(state, order.companyId)?.name}</div>
                                                <div className="t2 m">{order.id}</div>
                                            </td>
                                            <td>{part.mat || X}{part.surf ? ` · ${part.surf}` : ''}</td>
                                            <td className="n">{part.qty}</td>
                                            <td className="n">¥ {M(target)}</td>
                                            <td style={{ textAlign: 'right' }}>
                                                <button className="btn sm" type="button"
                                                    onClick={() => act((s) => addProdLine(s, prod.id, order.id, part.id))}>
                                                    ＋ 加进来
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </TableWrap>
                        </CardBody>
                    ) : (
                        <CardBody><Empty text="没有待安排的零件" /></CardBody>
                    )}
                </Card>
            )}
        </Page>
    )
}
