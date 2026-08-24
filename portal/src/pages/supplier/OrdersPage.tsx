/**
 * 供应商的生产订单 —— 只有已签合同的派单包才出现在这里。
 *
 * ★ 完成数直接在表格里改并上报。做成表内输入而不是弹窗：
 *   车间的人一天要报好几行，每行弹一次窗没人受得了。
 *
 * ★ 签完合同不等于能开工 —— 先「确认排产」，排进计划了才给上报入口。
 *   没排产就能报完成数，那个数就没有意义。
 */

import { useState } from 'react'
import { Stepper } from '../../components/form'
import { Bar, Card, CardBody, Empty, Hello, Page, Pill, TableWrap } from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { report, schedule } from '../../mock/actions'
import { M } from '../../mock/format'
import { contractOf, myPkgs } from '../../mock/selectors'

export function SupplierOrdersPage() {
    const { state, act } = useMock()
    const pkgs = myPkgs(state).filter((p) => contractOf(state, p.id)?.status === 'signed')

    // 每行一个输入缓冲，key 是派单号。没动过的行回落到已上报的数量。
    const [drafts, setDrafts] = useState<Record<string, string>>({})

    return (
        <Page>
            <Hello title="我的订单" right={<Pill tone="ne" dot={false}>共 {pkgs.length} 单</Pill>} />
            <Card>
                {pkgs.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>生产订单</th><th>零件</th><th>规格</th><th className="n">数量</th>
                                    <th className="n">金额</th><th className="n">要求交期</th><th className="n">已完成</th><th>进度</th><th>排产</th><th>上报</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pkgs.map((p) => {
                                    const done = p.done || 0
                                    const draft = drafts[p.id] ?? String(done)
                                    return (
                                        <tr key={p.id}>
                                            <td><span className="m">{p.id}</span></td>
                                            <td className="t1">{p.partName}</td>
                                            <td>{p.mat} · {p.surf}</td>
                                            <td className="n">{p.qty}</td>
                                            <td className="n">¥ {M(p.total)}</td>
                                            <td className="n">{p.wantLead}</td>
                                            <td className="n">{done} / {p.qty}</td>
                                            <td style={{ minWidth: 100 }}>
                                                <Bar pct={Math.round((done / p.qty) * 100)} />
                                            </td>
                                            <td>
                                                {p.scheduled ? (
                                                    <Pill tone="ok">已排产</Pill>
                                                ) : (
                                                    <button className="btn sm pri" type="button"
                                                        onClick={() => act((s) => schedule(s, p.id))}>
                                                        确认排产
                                                    </button>
                                                )}
                                            </td>
                                            <td>
                                                {p.delivered ? (
                                                    <Pill tone="ok">已交付 {p.delivered.slice(0, 10)}</Pill>
                                                ) : (
                                                <div style={{ display: 'flex', gap: 6, opacity: p.scheduled ? 1 : 0.4 }}>
                                                    {/* 上限是这个包的数量 —— 报多于订单量是笔误，直接挡住 */}
                                                    <Stepper value={draft} min={0} max={p.qty} width={116}
                                                        placeholder="件" disabled={!p.scheduled}
                                                        onChange={(v) => setDrafts((d) => ({ ...d, [p.id]: v }))} />
                                                    <button className="btn sm" type="button" disabled={!p.scheduled}
                                                        onClick={() => {
                                                            act((s) => report(s, p.id, draft))
                                                            // 清掉缓冲，让这一行回到跟随实际已报数量
                                                            setDrafts((d) => {
                                                                const next = { ...d }
                                                                delete next[p.id]
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
                ) : (
                    <CardBody><Empty text="还没有已签合同的生产订单" /></CardBody>
                )}
            </Card>
        </Page>
    )
}
