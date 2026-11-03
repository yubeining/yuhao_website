/**
 * 订单市场 —— 派给我的单和挂在全市场上的单（2026-09-18 拍板）。
 *
 * ★ 定向派单只有被派到的几家看得到；全市场的单所有可派单供应商都看得到。都是先到先得，谁先接给谁。
 * ★ 价格是按我的折率算的对供价（人民币），接单那一刻锁定。客户是谁、客户付多少，这里一律没有（后端就不给）。
 * ★ 以前这一页是原型（抢单截止、材料筛选、付款条件都是演示数据），已换成真数据。
 */

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Banner, Card, CardBody, CardHead, Empty, Hello, Page, pill, TableWrap } from '../../components/ui'
import { errorText } from '../../i18n/errorText'
import { useMock } from '../../mock/MockProvider'
import { fmtDateTime, M, X } from '../../mock/format'
import { listSupplierOffers, supplierOfferPrices, type OfferPrice, type SupplierOfferSummary } from '../../services'

export function HallPage() {
    const { t } = useMock()
    const navigate = useNavigate()
    const [offers, setOffers] = useState<SupplierOfferSummary[] | null>(null)
    const [prices, setPrices] = useState<Record<string, OfferPrice>>({})
    const [err, setErr] = useState<string | null>(null)

    const load = useCallback(async () => {
        try {
            const list = await listSupplierOffers()
            const ps = await supplierOfferPrices(list.map((o) => o.id))
            setPrices(Object.fromEntries(ps.map((p) => [p.opsOrderId, p])))
            setOffers(list)
            setErr(null)
        } catch (e) {
            setErr(errorText(t, e))
        }
    }, [t])

    useEffect(() => { void load() }, [load])

    return (
        <Page>
            <Hello title={t.supplier.hall.title} />
            {err && <Banner tone="wa" style={{ marginBottom: 14 }}>{err}</Banner>}
            <Card>
                <CardHead title={t.supplier.hall.availableTitle} rid={offers ? t.supplier.hall.available(offers.length) : undefined} />
                {offers === null ? (
                    <CardBody><Empty text={t.common.loading} /></CardBody>
                ) : offers.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>{t.supplier.hall.colSource}</th><th className="n">{t.supplier.hall.colLines}</th><th className="n">{t.supplier.hall.colQty}</th>
                                    <th className="n">{t.supplier.hall.colTotal}</th><th className="n">{t.supplier.hall.colDue}</th><th className="n">{t.supplier.hall.colDispatched}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {offers.map((o) => (
                                    <tr className="clk" key={o.id} onClick={() => navigate(`/supplier/hall/${o.id}`)}>
                                        <td>{o.dispatchMode === 'TARGETED' ? pill(['in', t.supplier.hall.targeted]) : pill(['ne', t.supplier.hall.openMarket])}</td>
                                        <td className="n">{o.lineCount}</td>
                                        <td className="n">{o.totalQuantity}</td>
                                        <td className="n"><b>{prices[o.id] ? `¥ ${M(prices[o.id].total)}` : X}</b></td>
                                        <td className="n">{o.supplierDueDate}</td>
                                        <td className="n">{fmtDateTime(new Date(o.dispatchedAt))}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                ) : (
                    <CardBody><Empty text={t.supplier.hall.empty} sub={t.supplier.hall.emptySub} /></CardBody>
                )}
            </Card>
        </Page>
    )
}
