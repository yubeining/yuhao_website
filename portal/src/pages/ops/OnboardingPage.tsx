/**
 * 供应商入驻：考察定级 + 邀请管理。
 *
 * ★ 定级和可抢范围在**通过的同一步**里定，不拆成两步。
 *   拆开的话必然出现「已开通但没定级」的中间态，而没定级的供应商
 *   在订单市场里该看到什么，是个没有好答案的问题。
 */

import { useState } from 'react'
import { Field, FieldRow, Input, Select } from '../../components/form'
import {
    Card, CardBody, CardHead, Empty, Hello, Page, Pill, PrototypeBanner, TableWrap,
} from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { approve, invite } from '../../mock/actions'
import { X } from '../../mock/format'
import { pendingSuppliers } from '../../mock/selectors'

const TIERS = ['A', 'B', 'C']
const SCOPES = ['全部品类', '常规件', '特定品类']

export function OpsOnboardingPage() {
    const { state, act } = useMock()
    const pending = pendingSuppliers(state)

    // 每家待考察企业一份定级草稿，key 是企业 id
    const [tiers, setTiers] = useState<Record<string, string>>({})
    const [scopes, setScopes] = useState<Record<string, string>>({})

    const [ivName, setIvName] = useState('')
    const [ivMail, setIvMail] = useState('')
    const [err, setErr] = useState<string | null>(null)

    const sendInvite = () => {
        if (!ivMail) return setErr('请填写接收邮箱')
        act((s) => invite(s, ivName, ivMail))
        setIvName('')
        setIvMail('')
        setErr(null)
    }

    return (
        <Page>
            <PrototypeBanner />
            <Hello title="供应商入驻" />

            <Card>
                <CardHead title="待考察供应商"
                    right={pending.length ? <Pill tone="wa" dot={false}>{pending.length} 家</Pill> : undefined} />
                {pending.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>企业</th><th>设备</th><th>联系人</th><th className="n">提交</th>
                                    <th>定级</th><th>可抢范围</th><th />
                                </tr>
                            </thead>
                            <tbody>
                                {pending.map((c) => (
                                    <tr key={c.id}>
                                        <td>
                                            <div className="t1">{c.name}</div>
                                            <div className="t2">{c.code || X}</div>
                                        </td>
                                        <td>
                                            <div className="t2" style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
                                                {(c.machines || [])
                                                    .map((m) => m.type + (m.qty ? ' ×' + m.qty : ''))
                                                    .join(' / ') || X}
                                            </div>
                                        </td>
                                        <td>
                                            {c.contact || X}
                                            <div className="t2">{c.phone || ''}</div>
                                        </td>
                                        <td className="n">{c.at || X}</td>
                                        <td>
                                            <Select value={tiers[c.id] ?? 'B'} options={TIERS}
                                                onChange={(v) => setTiers((d) => ({ ...d, [c.id]: v }))} />
                                        </td>
                                        <td>
                                            <Select value={scopes[c.id] ?? '常规件'} options={SCOPES}
                                                onChange={(v) => setScopes((d) => ({ ...d, [c.id]: v }))} />
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <button className="btn sm pri" type="button"
                                                onClick={() => act((s) => approve(
                                                    s, c.id, tiers[c.id] ?? 'B', scopes[c.id] ?? '常规件',
                                                ))}>
                                                通过并开通
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                ) : (
                    <CardBody><Empty text="没有待考察的供应商" /></CardBody>
                )}
            </Card>

            <Card style={{ marginTop: 18 }}>
                <CardHead title="邀请管理" />
                <CardBody>
                    <FieldRow>
                        <Field label="企业名称">
                            <Input value={ivName} onChange={setIvName} placeholder="受邀企业全称" />
                        </Field>
                        <Field label="接收邮箱">
                            <Input value={ivMail} onChange={(v) => { setIvMail(v); setErr(null) }}
                                placeholder="对方联系人邮箱" bad={!!err} />
                        </Field>
                    </FieldRow>
                    {err && <div className="errmsg" style={{ marginBottom: 12 }}>{err}</div>}
                    {/* ★ 只往本地 db 塞一条邀请记录，【不发任何邮件】。
                        原文写「生成并发送邀请」，运营会以为供应商已经收到，不再跟进 ——
                        而对方那边一直没动静。按钮只说它真做的那件事。 */}
                    <button className="btn pri" type="button" onClick={sendInvite}>生成邀请链接</button>
                    <div className="fnote" style={{ marginTop: 8 }}>
                        <b>邮件发送尚未接入</b> —— 链接生成后需自行转给对方。
                    </div>
                </CardBody>
                {state.db.invites.length > 0 && (
                    <CardBody flush style={{ borderTop: '1px solid var(--line)' }}>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>受邀企业</th><th>邮箱</th><th className="n">发出</th>
                                    <th>状态</th>
                                </tr>
                            </thead>
                            <tbody>
                                {state.db.invites.map((i) => (
                                    <tr key={i.id}>
                                        <td className="t1">{i.name || X}</td>
                                        <td><span className="m">{i.mail || X}</span></td>
                                        <td className="n">{i.at}</td>
                                        <td>{i.used ? <Pill tone="ok">已使用</Pill> : <Pill tone="wa">未使用</Pill>}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                )}
            </Card>
        </Page>
    )
}
