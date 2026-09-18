/**
 * 交易方主数据。
 *
 * ★ 平台自己（kind='platform'）不列在这里 —— 它不是交易对手。
 *   同一家企业可以既是客户又是供应商（kind='both'），这在跨境代工里很常见：
 *   帮你做零件的厂子，自己也要从别处买零件。
 */

import {
    Card, CardBody, Hello, Page, Pill, PrototypeBanner, TableWrap, Tier,
} from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import type { PartyKind } from '../../mock/types'

const KIND_LABEL: Record<PartyKind, string> = {
    platform: '平台',
    customer: '客户',
    supplier: '供应商',
    both: '客户 + 供应商',
}

export function OpsPartiesPage() {
    const { state } = useMock()
    const parties = state.db.companies.filter((c) => c.kind !== 'platform')

    return (
        <Page>
            <PrototypeBanner />
            <Hello title="交易方" />
            <Card>
                <CardBody flush>
                    <TableWrap>
                        <thead>
                            <tr>
                                <th>企业</th><th>类型</th><th>级别</th><th>设备</th>
                                <th>可抢范围</th><th>状态</th>
                            </tr>
                        </thead>
                        <tbody>
                            {parties.map((c) => (
                                <tr className="clk" key={c.id}>
                                    <td className="t1">{c.name}</td>
                                    <td>{KIND_LABEL[c.kind]}</td>
                                    <td>{c.tier ? <Tier tier={c.tier} /> : '—'}</td>
                                    <td>
                                        <div className="t2" style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
                                            {(c.machines || []).map((m) => m.type).join(' / ') || '—'}
                                        </div>
                                    </td>
                                    <td>{c.scope || '—'}</td>
                                    <td>
                                        {c.status === 'active'
                                            ? <Pill tone="ok">已开通</Pill>
                                            : <Pill tone="wa">待考察</Pill>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </TableWrap>
                </CardBody>
            </Card>
        </Page>
    )
}
