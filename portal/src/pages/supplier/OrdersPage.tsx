/**
 * 供应商的生产订单 —— 只有已签合同的才出现在这里。
 *
 * ★ 一个生产订单是一批活，里面有好几行零件。**排产是整单确认的**
 *   （他是按这一整批安排产能的），**报工是按行报的**（各行进度本来就不一样）。
 *
 * ★ 完成数直接在表格里改并上报。做成表内输入而不是弹窗：
 *   车间的人一天要报好几行，每行弹一次窗没人受得了。
 *
 * ★ 签完合同不等于能开工 —— 先「确认排产」，排进计划了才给上报入口。
 *   没排产就能报完成数，那个数就没有意义。
 */

import { useState } from 'react'
import { Stepper } from '../../components/form'
import { Bar, Card, CardBody, CardHead, Empty, Hello, Page, Pill, TableWrap } from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { report, schedule } from '../../mock/actions'
import { M, X } from '../../mock/format'
import { contractOf, myProds } from '../../mock/selectors'

export function SupplierOrdersPage() {
    const { state, act } = useMock()
    const prods = myProds(state).filter((d) => contractOf(state, d.id)?.status === 'signed')

    // 每行一个输入缓冲，key 是「生产订单号:零件id」。没动过的行回落到已上报的数量。
    const [drafts, setDrafts] = useState<Record<string, string>>({})

    return (
        <Page>
            <Hello title="我的订单" right={<Pill tone="ne" dot={false}>共 {prods.length} 单</Pill>} />
            {prods.length ? prods.map((d) => {
                const qty = d.lines.reduce((a, l) => a + l.qty, 0)
                return (
                    <Card key={d.id} style={{ marginBottom: 16 }}>
                        <CardHead
                            title={d.id}
                            rid={`${d.lines.length} 行 · 共 ${qty} 件 · ¥ ${M(d.total)}`}
                            right={d.scheduled
                                ? <Pill tone="ok">已排产</Pill>
                                : (
                                    <button className="btn sm pri" type="button"
                                        onClick={() => act((s) => schedule(s, d.id))}>
                                        确认排产
                                    </button>
                                )}
                        />
                        <CardBody flush>
                            <TableWrap>
                                <thead>
                                    <tr>
                                        <th>零件</th><th>规格</th><th className="n">数量</th>
                                        <th className="n">单件</th><th className="n">小计</th>
                                        <th className="n">要求交期</th><th className="n">已完成</th>
                                        <th>进度</th><th>上报</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {d.lines.map((l) => {
                                        const key = `${d.id}:${l.partId}`
                                        const ld = l.done ?? 0
                                        const draft = drafts[key] ?? String(ld)
                                        return (
                                            <tr key={l.partId}>
                                                <td className="t1">
                                                    {l.partName}
                                                    {l.rev ? <div className="t2 m">Rev {l.rev}</div> : null}
                                                </td>
                                                <td>{l.mat || X}{l.surf ? ` · ${l.surf}` : ''}</td>
                                                <td className="n">{l.qty}</td>
                                                <td className="n">¥ {M(l.target)}</td>
                                                <td className="n">¥ {M(l.total)}</td>
                                                <td className="n">{l.wantLead}</td>
                                                <td className="n">{ld} / {l.qty}</td>
                                                <td style={{ minWidth: 100 }}>
                                                    <Bar pct={Math.round((ld / Math.max(1, l.qty)) * 100)} />
                                                </td>
                                                <td>
                                                    {l.delivered ? (
                                                        <Pill tone="ok">已交付 {l.delivered.slice(0, 10)}</Pill>
                                                    ) : (
                                                        <div style={{ display: 'flex', gap: 6, opacity: d.scheduled ? 1 : 0.4 }}>
                                                            {/* 上限是这一行的数量 —— 报多于订单量是笔误，直接挡住 */}
                                                            <Stepper value={draft} min={0} max={l.qty} width={116}
                                                                placeholder="件" disabled={!d.scheduled}
                                                                onChange={(v) => setDrafts((x) => ({ ...x, [key]: v }))} />
                                                            <button className="btn sm" type="button" disabled={!d.scheduled}
                                                                onClick={() => {
                                                                    act((s) => report(s, d.id, l.partId, draft))
                                                                    // 清掉缓冲，让这一行回到跟随实际已报数量
                                                                    setDrafts((x) => {
                                                                        const next = { ...x }
                                                                        delete next[key]
                                                                        return next
                                                                    })
                                                                }}>
                                                                上报
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </TableWrap>
                        </CardBody>
                    </Card>
                )
            }) : (
                <Card><CardBody><Empty text="还没有已签合同的生产订单" /></CardBody></Card>
            )}
        </Page>
    )
}
