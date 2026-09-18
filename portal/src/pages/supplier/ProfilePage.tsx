/**
 * 供应商企业资料。分级与可抢范围由内部考察后设定，供应商这边只读。
 */

import {
    Card, CardBody, CardHead, Cols, Empty, Hello, Kv, KvRow, Page, Pill, PrototypeBanner, Stack, TableWrap, Tier,
} from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { currentCompany } from '../../mock/actions'
import { X } from '../../mock/format'

export function SupplierProfilePage() {
    const { state } = useMock()
    const c = currentCompany(state)
    if (!c) {
        return (
            <Page>
                <PrototypeBanner />
                <Hello title="企业资料" />
                <Card><CardBody><Empty text="还没接真实数据" /></CardBody></Card>
            </Page>
        )
    }

    return (
        <Page>
            <PrototypeBanner />
            <Hello
                title="企业资料"
                right={
                    c.status === 'active' ? (
                        <>
                            {c.tier && <Tier tier={c.tier} />}
                            {/* ★ 这个值是运营在资质审核时填进来的真数据，但它【不参与任何过滤】——
                                canGrab 只看 status。用绿色 ok 底色显示会读成"市场已按这个范围向我开放"，
                                实际上全都能抢。降成中性底色，并注明尚未生效。 */}
                            <Pill tone="ne">{c.scope}</Pill>
                            <span className="fnote">（记录用，暂未参与派单过滤）</span>
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
