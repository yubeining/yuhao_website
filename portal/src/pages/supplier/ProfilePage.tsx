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
    const { state, t } = useMock()
    const c = currentCompany(state)
    if (!c) {
        return (
            <Page>
                <PrototypeBanner />
                <Hello title={t.supplier.profile.title} />
                <Card><CardBody><Empty text={t.supplier.profile.noData} /></CardBody></Card>
            </Page>
        )
    }

    return (
        <Page>
            <PrototypeBanner />
            <Hello
                title={t.supplier.profile.title}
                right={
                    c.status === 'active' ? (
                        <>
                            {c.tier && <Tier tier={c.tier} />}
                            {/* ★ 这个值是运营在资质审核时填进来的真数据，但它【不参与任何过滤】——
                                canGrab 只看 status。用绿色 ok 底色显示会读成"市场已按这个范围向我开放"，
                                实际上全都能抢。降成中性底色，并注明尚未生效。 */}
                            <Pill tone="ne">{c.scope}</Pill>
                            <span className="fnote">{t.supplier.profile.note}</span>
                        </>
                    ) : (
                        <Pill tone="wa">{t.supplier.profile.inspecting}</Pill>
                    )
                }
            />
            <Cols>
                <Stack>
                    <Card>
                        <CardHead title={t.supplier.profile.equipmentTitle} />
                        <CardBody flush>
                            <TableWrap>
                                <thead>
                                    <tr>
                                        <th>{t.supplier.profile.colEquipType}</th><th className="n">{t.customer.quotes.colQty}</th>
                                        <th>{t.supplier.profile.colMaxSize}</th><th>{t.supplier.profile.colPrecision}</th>
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
                        <CardHead title={t.supplier.profile.infoTitle} />
                        <CardBody>
                            <Kv>
                                <KvRow k={t.supplier.profile.orgName} v={c.name} sans />
                                <KvRow k={t.supplier.profile.uscc} v={c.code || X} />
                                <KvRow k={t.supplier.profile.contactPhone} v={`${c.contact || X} · ${c.phone || X}`} />
                                <KvRow k={t.supplier.profile.invoiceTitle} v={c.invTitle || X} sans />
                                <KvRow k={t.supplier.profile.bankAccount} v={c.acct || X} />
                            </Kv>
                        </CardBody>
                    </Card>
                </Stack>
            </Cols>
        </Page>
    )
}
