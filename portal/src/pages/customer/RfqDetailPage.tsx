/**
 * 询价详情。
 *
 * ★ 这一页是「补齐」环节的落点（设计文档 9 §4.2）：
 *   提交进来的行里有一部分缺图纸版本和材料，在这里补齐、确认，然后才能出报价。
 *
 * ★ 演示里补齐动作由客户自己完成。真实流程是两步 ——
 *   我方看图填 → 客户确认。材料是定价的直接输入，我方看错牌号报出去的价就是错的，
 *   而客户从报价单上看不出这个数是谁定的，所以必须让他签这一下。
 */

import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Input, Select } from '../../components/form'
import {
    Banner, Card, CardBody, CardFoot, CardHead, Cols, Fields, Fld, Hello,
    Page, Pill, pill, Stack, TableWrap,
} from '../../components/ui'
import type { PillSpec } from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { fillLine, lineStat, makeQuote } from '../../mock/actions'
import { X, sum } from '../../mock/format'
import { materials, num, SURFACES } from '../../mock/params'
import { myRfqs } from '../../mock/selectors'
import type { LineStat } from '../../mock/types'
import { RFQ_ST } from './status'

const STAT_L: Record<LineStat, PillSpec> = {
    ready: ['ok', '可报价'],
    pending: ['wa', '待确认'],
    blocked: ['ba', '缺必填'],
}

export function RfqDetailPage() {
    const { state, actWith } = useMock()
    const navigate = useNavigate()
    const { id } = useParams()
    const rfq = myRfqs(state).find((r) => r.id === id)
    const mats = materials(state.rates)
    /** 正在补齐的行下标。一次只补一行 —— 批量补容易漏看 */
    const [editing, setEditing] = useState<number | null>(null)
    const [draft, setDraft] = useState({ rev: '', mat: '', surf: SURFACES[0] })

    if (!rfq) return <Navigate to="/customer/rfqs" replace />

    const stats = rfq.lines.map(lineStat)
    const pending = stats.filter((s) => s === 'pending').length
    const quotedNos = new Set(
        state.db.quotes.filter((q) => q.rfqId === rfq.id).flatMap((q) => q.items.map((i) => i.no)),
    )
    const quotableNow = rfq.lines.filter((l, i) => stats[i] === 'ready' && !quotedNos.has(l.no)).length

    const startEdit = (i: number) => {
        const l = rfq.lines[i]
        setDraft({ rev: l.rev, mat: l.mat, surf: l.surf || SURFACES[0] })
        setEditing(i)
    }

    const save = (i: number) => {
        actWith((s) => fillLine(s, rfq.id, i, draft))
        setEditing(null)
    }

    const quote = () => {
        const q = actWith((s) => {
            const r = s.db.rfqs.find((x) => x.id === rfq.id)!
            return makeQuote(s, r)
        })
        if (q) navigate(`/customer/quotes/${q.id}`)
    }

    return (
        <Page>
            <Hello
                back={<Link className="btn sm qui" to="/customer/rfqs" style={{ margin: '0 0 6px -9px' }}>← 我的询价</Link>}
                title="询价详情" sub={rfq.id}
                right={pill(RFQ_ST[rfq.status])}
            />

            {pending > 0 && (
                <Banner tone="wa" style={{ marginBottom: 18 }}>
                    有 {pending} 行还缺图纸版本或材料，不能报价。
                    补齐并确认后即可获取这些行的报价 —— 已经发出的报价不受影响。
                </Banner>
            )}

            <Cols>
                <Stack>
                    <Card>
                        <CardHead title="清单行" right={
                            <Pill tone="ne" dot={false}>{rfq.lines.length} 行</Pill>
                        } />
                        <CardBody flush>
                            <TableWrap>
                                <thead>
                                    <tr>
                                        <th className="n">行</th><th>图号</th><th>名称</th>
                                        <th className="n">数量</th><th>版本</th><th>材料</th>
                                        <th>表面处理</th><th>状态</th><th />
                                    </tr>
                                </thead>
                                <tbody>
                                    {rfq.lines.map((l, i) => {
                                        const s = stats[i]
                                        const on = editing === i
                                        return (
                                            <tr key={i} className={s === 'pending' ? 'rowwarn' : ''}>
                                                <td className="n">{i + 1}</td>
                                                <td className="t1">{l.no}</td>
                                                <td>{l.name}</td>
                                                <td className="n">{l.qty}</td>
                                                <td>
                                                    {on
                                                        ? <Input value={draft.rev} placeholder="A / B"
                                                            onChange={(v) => setDraft((d) => ({ ...d, rev: v }))} />
                                                        : <span className="m">{l.rev || X}</span>}
                                                </td>
                                                <td>
                                                    {on
                                                        ? <Select value={draft.mat} options={['', ...mats]}
                                                            onChange={(v) => setDraft((d) => ({ ...d, mat: v }))} />
                                                        : (l.mat || X)}
                                                </td>
                                                <td>
                                                    {on
                                                        ? <Select value={draft.surf} options={SURFACES}
                                                            onChange={(v) => setDraft((d) => ({ ...d, surf: v }))} />
                                                        : (l.surf || X)}
                                                </td>
                                                <td>{pill(STAT_L[s])}</td>
                                                <td style={{ textAlign: 'right' }}>
                                                    {on ? (
                                                        <>
                                                            <button className="btn qui sm" type="button"
                                                                onClick={() => setEditing(null)}>取消</button>
                                                            <button className="btn sm pri" type="button"
                                                                onClick={() => save(i)}>确认</button>
                                                        </>
                                                    ) : s === 'pending' ? (
                                                        <button className="btn sm" type="button"
                                                            onClick={() => startEdit(i)}>补齐</button>
                                                    ) : quotedNos.has(l.no) ? (
                                                        <span style={{ fontSize: 12, color: 'var(--faint)' }}>已报价</span>
                                                    ) : null}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </TableWrap>
                        </CardBody>
                        {quotableNow > 0 && (
                            <CardFoot right={
                                <button className="btn pri" type="button" onClick={quote}>
                                    获取 {quotableNow} 行的报价 →
                                </button>
                            } />
                        )}
                    </Card>
                </Stack>

                <Stack>
                    <Card>
                        <CardHead title="询价信息" />
                        <CardBody>
                            <Fields>
                                <Fld k="提交时间" v={rfq.at} mono />
                                <Fld k="交期要求" v={rfq.want} mono />
                                <Fld k="零件行数" v={rfq.lines.length} mono />
                                <Fld k="总件数" v={sum(rfq.lines, (l) => num(l.qty))} mono />
                            </Fields>
                        </CardBody>
                    </Card>

                    {/* 客户自己的编号。我方不解析不校验，原样回显 —— 他要拿去对自己的账 */}
                    {rfq.lines.some((l) => l.taskNo || l.systemNo || l.topicNo) && (
                        <Card>
                            <CardHead title="你的编号" />
                            <CardBody flush>
                                <TableWrap>
                                    <thead>
                                        <tr><th>图号</th><th>任务编号</th><th>系统号</th><th>课题号</th></tr>
                                    </thead>
                                    <tbody>
                                        {rfq.lines.map((l, i) => (
                                            <tr key={i}>
                                                <td className="t1">{l.no}</td>
                                                <td><span className="m">{l.taskNo || X}</span></td>
                                                <td><span className="m">{l.systemNo || X}</span></td>
                                                <td><span className="m">{l.topicNo || X}</span></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </TableWrap>
                            </CardBody>
                        </Card>
                    )}

                    {state.db.quotes.filter((q) => q.rfqId === rfq.id).length > 0 && (
                        <Card>
                            <CardHead title="已出报价" />
                            <CardBody flush>
                                <TableWrap>
                                    <tbody>
                                        {state.db.quotes.filter((q) => q.rfqId === rfq.id).map((q) => (
                                            <tr className="clk" key={q.id}
                                                onClick={() => navigate(`/customer/quotes/${q.id}`)}>
                                                <td><span className="m">{q.id}</span></td>
                                                <td className="n">{q.items.length} 行</td>
                                                <td style={{ textAlign: 'right', color: 'var(--faint)' }}>›</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </TableWrap>
                            </CardBody>
                        </Card>
                    )}
                </Stack>
            </Cols>
        </Page>
    )
}
