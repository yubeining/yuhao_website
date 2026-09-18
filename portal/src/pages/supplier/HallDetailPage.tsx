/**
 * 单子详情 —— 看零件、图纸、对供价、交期，接单或不接（2026-09-18 拍板）。
 *
 * ★ 先到先得：点「接单」时如果已经被别人接走 / 被平台收回，会提示，不会重复接。
 * ★ 定向派给你的可以点「不接」，只把你移出，别的被派到的供应商照常可接；全市场的单不接就行，没有「不接」按钮。
 * ★ 看图每次都记录（审计）。接单后签合同之前双方都可以退（在「我的订单」里退单）。
 */

import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
    Banner, Card, CardBody, CardFoot, CardHead, Empty, Fields, Fld, Hello, Page, pill, TableWrap,
} from '../../components/ui'
import { errorText } from '../../i18n/errorText'
import { useMock } from '../../mock/MockProvider'
import { fmtDateTime, M, X } from '../../mock/format'
import {
    acceptSupplierOffer, ApiError, declineSupplierOffer, getSupplierOffer, supplierOfferFileUrl, supplierOfferPrices,
    type OfferPrice, type SupplierOffer,
} from '../../services'

export function HallDetailPage() {
    const { t } = useMock()
    const navigate = useNavigate()
    const { id = '' } = useParams()
    const [offer, setOffer] = useState<SupplierOffer | null>(null)
    const [price, setPrice] = useState<OfferPrice | null>(null)
    const [missing, setMissing] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    const load = useCallback(async () => {
        try {
            setOffer(await getSupplierOffer(id))
            setPrice((await supplierOfferPrices([id]))[0] ?? null)
        } catch (e) {
            if (e instanceof ApiError && (e.code === 404 || e.code === 400)) setMissing(true)
            else setErr(errorText(t, e))
        }
    }, [id, t])

    useEffect(() => { void load() }, [load])

    const back = <Link className="btn sm qui" to="/supplier/hall" style={{ margin: '0 0 6px -9px' }}>← 订单市场</Link>

    if (missing) {
        return (
            <Page><Hello back={back} title="单子详情" /><Card><CardBody>
                <Empty text="这张单已经不在了" sub="可能已被别人接走，或平台已经收回" />
            </CardBody></Card></Page>
        )
    }
    if (!offer) {
        return <Page><Card><CardBody><Empty text={err ?? '加载中…'} /></CardBody></Card></Page>
    }

    const priceOf = (lineId: string) => price?.lines.find((l) => l.lineId === lineId)
    const targeted = offer.dispatchMode === 'TARGETED'

    const accept = () => {
        if (!window.confirm(`按 ¥ ${price ? M(price.total) : X}、交期 ${offer.supplierDueDate} 接下这张单？`)) return
        setBusy(true)
        acceptSupplierOffer(offer.id)
            .then(() => navigate('/supplier/orders', { replace: true }))
            .catch((e) => setErr(errorText(t, e)))
            .finally(() => setBusy(false))
    }

    const decline = () => {
        if (!window.confirm('不接这张单？它会从你的列表里消失。')) return
        setBusy(true)
        declineSupplierOffer(offer.id)
            .then(() => navigate('/supplier/hall', { replace: true }))
            .catch((e) => setErr(errorText(t, e)))
            .finally(() => setBusy(false))
    }

    const view = (lineId: string, fileId: string) => {
        supplierOfferFileUrl(offer.id, lineId, fileId)
            .then((u) => window.location.assign(u.url))
            .catch((e) => setErr(errorText(t, e)))
    }

    return (
        <Page>
            <Hello back={back} title="单子详情" right={targeted ? pill(['in', '定向派给你']) : pill(['ne', '全市场'])} />
            {err && <Banner tone="wa" style={{ marginBottom: 14 }}>{err}</Banner>}
            <Card style={{ marginBottom: 16 }}>
                <CardHead title="概况" />
                <CardBody>
                    <Fields>
                        <Fld k="交期" v={offer.supplierDueDate} mono />
                        <Fld k="对供合计" v={price ? `¥ ${M(price.total)}` : X} mono />
                        <Fld k="派出时间" v={fmtDateTime(new Date(offer.dispatchedAt))} mono />
                    </Fields>
                    <div className="t2" style={{ marginTop: 8 }}>先到先得，谁先接给谁。价格是人民币，接单时锁定。</div>
                </CardBody>
            </Card>
            <Card>
                <CardHead title={`零件 ${offer.lines.length} 行`} />
                <CardBody flush>
                    <TableWrap>
                        <thead>
                            <tr>
                                <th>图号</th><th>名称</th><th>材料 / 表面处理</th><th className="n">数量</th>
                                <th className="n">单价 ¥</th><th className="n">小计 ¥</th><th>图纸</th>
                            </tr>
                        </thead>
                        <tbody>
                            {offer.lines.map((l) => (
                                <tr key={l.id}>
                                    <td className="m">{l.code}</td>
                                    <td className="t1">{l.partName}</td>
                                    <td>{l.material || X}<div className="t2">{l.surfaceTreatment || X}</div></td>
                                    <td className="n">{l.quantity}</td>
                                    <td className="n">{priceOf(l.id) ? M(priceOf(l.id)!.unitPriceCny) : X}</td>
                                    <td className="n">{priceOf(l.id) ? M(priceOf(l.id)!.lineTotalCny) : X}</td>
                                    <td>
                                        {l.files.length ? l.files.map((f) => (
                                            <div key={f.id}>
                                                <button className="btn qui sm" type="button" onClick={() => view(l.id, f.id)}>{f.originalFilename}</button>
                                            </div>
                                        )) : X}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </TableWrap>
                </CardBody>
                <CardFoot
                    left={targeted ? <button className="btn" type="button" disabled={busy} onClick={decline}>不接</button> : undefined}
                    right={<button className="btn pri" type="button" disabled={busy} onClick={accept}>接单</button>}
                />
            </Card>
        </Page>
    )
}
