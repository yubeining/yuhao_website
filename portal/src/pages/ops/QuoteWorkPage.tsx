/**
 * 报价工作台 —— 运营在这里给一张单子定价，然后出报价单。
 *
 * ★★ 一个零件的基准成本只有两个来源：**AI 估的**，或者**人工填的**。
 *   两者在界面上从头到尾分得清（来源那一列），并且一起快照进报价行。
 *   分不清的后果是复盘时说不清究竟是模型不准还是人填错了。
 *
 * ★ AI 那一块是**模拟输出**，页头有横幅明说。置信度、样本数、区间都是
 *   按图号哈希出来的，只有结构是真的（文档 8 §5 的契约）。
 *   不标出来的话，一个假的置信度会被当成真的用来决定要不要复核。
 *
 * ★ 估的是基准成本（制造成本 ¥/件），不是对客价（文档 8 §1）。
 *   对客价和供应商目标价是在它身上乘出来的，这一页把三个数并排摆着，
 *   运营改一个能立刻看见另外两个怎么动。
 *
 * ★ 出单闸门沿用 pricingBlockers：有零件没定价、或者系数没配全，就出不了单，
 *   缺什么直接写在按钮旁边 —— 不给一个点了没反应的按钮。
 */

import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Input } from '../../components/form'
import {
    Banner, Card, CardBody, CardFoot, CardHead, Fields, Fld, Hello, Page, pill, TableWrap,
} from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { finishPricing, findCompany, runAi, setBase } from '../../mock/actions'
import { AI_MIN_CONF, AI_MODEL } from '../../mock/ai'
import { M, X, money } from '../../mock/format'
import { custUnit, num, pricingBlockers, supTarget } from '../../mock/params'
import { quoteOf } from '../../mock/selectors'
import { ORD_ST } from '../customer/status'
import type { OrderPart } from '../../mock/types'

/** 来源徽标。零件还没定价时不给徽标 —— 空着就是空着。 */
const srcPill = (p: OrderPart) =>
    p.base == null ? null
        : p.baseSrc === 'ai' ? pill(['in', 'AI 估价'])
            : pill(['ok', '人工定价'])

export function OpsQuoteWorkPage() {
    const { state, act } = useMock()
    const { id } = useParams()
    const order = state.db.orders.find((o) => o.id === id)
    /** 正在编辑的那一行的输入值。key = partId */
    const [draft, setDraft] = useState<Record<string, string>>({})

    if (!order) return <Navigate to="/ops/quotes" replace />

    const quote = quoteOf(state, order)
    const blockers = pricingBlockers(state.params, order.parts)
    const pending = order.parts.filter((p) => p.base == null)
    const unrun = order.parts.filter((p) => p.ai === undefined)
    const done = order.status !== 'pricing'

    const save = (partId: string) => {
        const raw = draft[partId]
        if (raw === undefined) return
        const v = raw.trim() === '' ? null : num(raw)
        act((s) => setBase(s, order.id, partId, v))
        setDraft(({ [partId]: _drop, ...rest }) => rest)
    }

    return (
        <Page>
            <Hello
                back={<Link className="btn sm qui" to="/ops/quotes" style={{ margin: '0 0 6px -9px' }}>← 报价</Link>}
                title={order.title}
                sub={`${order.id} · ${findCompany(state, order.companyId)?.name ?? X}`}
                right={pill(ORD_ST[order.status])}
            />

            {/* ★★ 这条横幅不许去掉：底下那些置信度是编的 */}
            <Banner tone="wa" style={{ marginBottom: 14 }}>
                <b>AI 估价目前是模拟输出</b> —— 模型版本 {AI_MODEL}。
                基准价、区间、置信度、样本数都是按零件字段算出来的固定值，<b>背后没有模型</b>。
                结构照文档 8 §5 的契约做，换成真模型时这一页不用改。
            </Banner>

            {done && quote && (
                <Banner tone="ok" style={{ marginBottom: 14 }}>
                    报价单 <b>{quote.id}</b> 已生成，合计 {money(quote.total)}。
                    这一页转为只读 —— 已发出的报价不能改价（文档 3 护栏 1）。
                </Banner>
            )}

            <Card style={{ marginBottom: 16 }}>
                <CardHead
                    title="零件定价"
                    rid={`${order.parts.length - pending.length} / ${order.parts.length} 已定价`}
                    right={!done && unrun.length > 0 ? (
                        <button className="btn sm" type="button"
                            onClick={() => act((s) => runAi(s, order.id))}>
                            对 {unrun.length} 个未估零件跑 AI
                        </button>
                    ) : undefined}
                />
                <CardBody flush>
                    <TableWrap>
                        <thead>
                            <tr>
                                <th>零件</th>
                                <th className="n">数量</th>
                                <th className="n">AI 基准价</th>
                                <th className="n">区间 ±30%</th>
                                <th className="n">置信度</th>
                                <th>采用的基准成本</th>
                                <th className="n">对客单价</th>
                                <th className="n">供应商目标价</th>
                            </tr>
                        </thead>
                        <tbody>
                            {order.parts.map((p) => {
                                const e = p.ai
                                const low = e && e.confidence > 0 && e.confidence < AI_MIN_CONF
                                const unit = custUnit(state.params, p.base)
                                const target = supTarget(state.params, p.base)
                                const editing = draft[p.id] !== undefined
                                return (
                                    <tr key={p.id}>
                                        <td className="t1">
                                            {p.name}
                                            <div className="t2 m">{p.no} · v{p.version} · {p.mat || X}</div>
                                        </td>
                                        <td className="n">{p.qty}</td>
                                        <td className="n">{e?.base != null ? `¥ ${M(e.base)}` : X}</td>
                                        <td className="n">
                                            {e?.range ? <span className="t2">¥ {M(e.range.low)} – {M(e.range.high)}</span> : X}
                                        </td>
                                        <td className="n">
                                            {e === undefined ? <span className="t2">未估</span>
                                                : e.blocked ? <span className="t2">{e.blocked}</span>
                                                    : <>
                                                        <b>{Math.round(e.confidence * 100)}%</b>
                                                        <div className="t2">{e.similarSamples} 条相似样本</div>
                                                        {low && <div className="t2">低于 {AI_MIN_CONF * 100}%，转人工</div>}
                                                    </>}
                                        </td>
                                        <td>
                                            {done ? (
                                                <>¥ {p.base != null ? M(p.base) : X} {srcPill(p)}</>
                                            ) : (
                                                <div className="fcell">
                                                    <Input
                                                        value={editing ? draft[p.id] : (p.base != null ? String(p.base) : '')}
                                                        onChange={(v) => setDraft((d) => ({ ...d, [p.id]: v }))}
                                                        placeholder="¥ / 件"
                                                        style={{ width: 110 }}
                                                    />
                                                    {editing
                                                        ? <button className="btn sm pri" type="button" onClick={() => save(p.id)}>存</button>
                                                        : srcPill(p)}
                                                </div>
                                            )}
                                            {p.baseAt && !editing && <div className="t2">{p.baseAt}</div>}
                                        </td>
                                        <td className="n">{unit != null ? money(unit) : X}</td>
                                        <td className="n">{target != null ? `¥ ${M(target)}` : X}</td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </TableWrap>
                </CardBody>
                {!done && (
                    <CardFoot
                        left={blockers.length
                            ? <span className="t2">出不了单：{blockers.join('；')}</span>
                            : <span className="t2">全部零件已定价，可以出报价单</span>}
                        right={
                            <button className="btn pri" type="button" disabled={blockers.length > 0}
                                onClick={() => act((s) => { finishPricing(s, order.id) })}>
                                生成报价单
                            </button>
                        }
                    />
                )}
            </Card>

            <Card>
                <CardHead title="算法" />
                <CardBody>
                    <Fields>
                        <Fld k="对客单价 €/件" v="基准成本 × (1 + 利润率) ÷ 汇率" />
                        <Fld k="供应商目标价 ¥/件" v="基准成本 × (1 + 议价空间)" />
                        <Fld k="利润率" v={state.params.margin != null ? `${state.params.margin}%` : '未设置'} />
                        <Fld k="议价空间" v={state.params.spread != null ? `${state.params.spread}%` : '未设置'} />
                        <Fld k="汇率 EUR→CNY" v={state.params.fx ?? '未设置'} mono />
                        <Fld k="转人工阈值" v={`置信度 < ${AI_MIN_CONF * 100}%（文档 8 Q18）`} />
                    </Fields>
                    <div className="t2" style={{ marginTop: 10, lineHeight: 1.6 }}>
                        基准成本是<b>制造成本</b>，不含利润率 —— 混进去之后模型就说不清自己在预测什么（文档 8 §1）。
                        系数在<Link to="/ops/rates">定价参数</Link>页改，只影响之后生成的报价单。
                    </div>
                </CardBody>
            </Card>
        </Page>
    )
}
