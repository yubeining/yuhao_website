/**
 * 供应商企业资料。分级与可抢范围由内部考察后设定，供应商这边只读。
 */

import { Card, CardBody, CardHead, Cols, Hello, Kv, KvRow, Page, Pill, Stack, TableWrap, Tier } from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { currentCompany } from '../../mock/actions'
import { X } from '../../mock/format'

export function SupplierProfilePage() {
    const { state } = useMock()
    const c = currentCompany(state)
    if (!c) return null

    return (
        <Page>
            <Hello
                title="企业资料"
                right={
                    c.status === 'active' ? (
                        <>
                            {c.tier && <Tier tier={c.tier} />}
                            <Pill tone="ok">{c.scope}</Pill>
                        </>
                    ) : (
                        <Pill tone="wa">资质考察中</Pill>
                    )
                }
            />
            <Cols>
                <Stack>
                    <Card>
                        <CardHead title="设备清单" />
                        <CardBody flush>
                            <TableWrap>
                                <thead>
                                    <tr>
                                        <th>设备类型</th><th className="n">数量</th>
                                        <th>最大加工尺寸</th><th>加工精度</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(c.machines || []).map((m, i) => (
                                        <tr key={i}>
                                            <td className="t1">{m.type}</td>
                                            <td className="n">{m.qty || X}</td>
                                            <td>{m.size || X}</td>
                                            <td>{m.prec || X}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </TableWrap>
                        </CardBody>
                    </Card>
                </Stack>

                <Stack>
                    <Card>
                        <CardHead title="企业信息" />
                        <CardBody>
                            <Kv>
                                <KvRow k="企业名称" v={c.name} sans />
                                <KvRow k="统一社会信用代码" v={c.code || X} />
                                <KvRow k="联系人 / 手机" v={`${c.contact || X} · ${c.phone || X}`} />
                                <KvRow k="开票抬头" v={c.invTitle || X} sans />
                                <KvRow k="收款账户" v={c.acct || X} />
                            </Kv>
                        </CardBody>
                    </Card>
                </Stack>
            </Cols>
        </Page>
    )
}
