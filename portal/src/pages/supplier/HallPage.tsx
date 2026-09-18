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
            <Hello title="订单市场" />
            {err && <Banner tone="wa" style={{ marginBottom: 14 }}>{err}</Banner>}
            <Card>
                <CardHead title="可以接的单" rid={offers ? `${offers.length} 张` : undefined} />
                {offers === null ? (
                    <CardBody><Empty text="加载中…" /></CardBody>
                ) : offers.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>来源</th><th className="n">零件行</th><th className="n">件数</th>
                                    <th className="n">对供合计</th><th className="n">交期</th><th className="n">派出时间</th>
                                </tr>
                            </thead>
                            <tbody>
                                {offers.map((o) => (
                                    <tr className="clk" key={o.id} onClick={() => navigate(`/supplier/hall/${o.id}`)}>
                                        <td>{o.dispatchMode === 'TARGETED' ? pill(['in', '定向派给你']) : pill(['ne', '全市场'])}</td>
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
                    <CardBody><Empty text="暂时没有可以接的单" sub="平台派单后会出现在这里" /></CardBody>
                )}
            </Card>
        </Page>
    )
}
