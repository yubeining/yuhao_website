/**
 * 生产订单详情 —— 看里面的零件、每家供应商的对供价，定向派几家或挂全市场，收回（2026-09-18 拍板）。
 *
 * ★ 派法二选一：定向派给选中的几家（先到先得，有人拒接只移出他，全部拒接才回组装中）/ 挂全市场（所有可派单供应商）。
 * ★ 对供价 = 原价 × 该供应商折率，后端按当前折率现算；供应商接单那一刻锁定。页面不自己乘。
 * ★ 对供交期由运营每次派单时手填；客户那边的交期在报价页看（客户确认后 N 天）。
 * ★ 签字前可收回：还没人接 →「收回」；已被接下 →「收回供应商」（对方的单取消，这张回组装中重派）。
 * ★ 合同（2026-09-20）：供应商接单后运营点「建合同」，供应商在自己那边签字。本轮不生成 PDF、没有条款正文，
 *   页面上就是单据本身的内容。**接单后 7 天没签字系统自动取消**（从接单算），页面上写明这个期限。
 *   签字之后锁定：收不回、作废不了。
 */

import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Checkbox, Input } from '../../components/form'
import {
    Banner, Card, CardBody, CardFoot, CardHead, Empty, Fields, Fld, Hello, Page, pill, TableWrap,
} from '../../components/ui'
import { errorText } from '../../i18n/errorText'
import { useMock } from '../../mock/MockProvider'
import { fmtDateTime, M, X } from '../../mock/format'
import {
    ApiError, cancelSupplierContract, createSupplierContract, deleteOpsDispatchOrder, getOpsDispatchOrder,
    offerOpsOrder, opsSupplierPrices, publishOpsOrder, recallOpsOrder, revokeOpsOrderSupplier, unallocateLine,
    type OpsOrderDetail, type OpsSupplierPrice,
} from '../../services'
import { cancelReason, dispatchMode, offerSt, opsOrderSt, shortId, supplierOrderSt } from './dispatchStatus'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function OpsProdPage() {
    const { t } = useMock()
    const navigate = useNavigate()
    const { id = '' } = useParams()
    const [order, setOrder] = useState<OpsOrderDetail | null>(null)
    const [prices, setPrices] = useState<OpsSupplierPrice[]>([])
    const [missing, setMissing] = useState(false)
    const [chosen, setChosen] = useState<string[]>([])
    const [due, setDue] = useState('')
    const [err, setErr] = useState<string | null>(null)
    const [ok, setOk] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    const load = useCallback(async () => {
        try {
            const o = await getOpsDispatchOrder(id)
            setOrder(o)
            setPrices(o.lines.length ? await opsSupplierPrices(id) : [])
        } catch (e) {
            if (e instanceof ApiError && (e.code === 404 || e.code === 400)) setMissing(true)
            else setErr(errorText(t, e))
        }
    }, [id, t])

    useEffect(() => { void load() }, [load])

    const back = <Link className="btn sm qui" to="/ops/dispatch" style={{ margin: '0 0 6px -9px' }}>{t.prodDetail.back}</Link>

    if (missing) {
        return <Page><Hello back={back} title={t.prodDetail.title} /><Card><CardBody><Empty text={t.prodDetail.notFound} /></CardBody></Card></Page>
    }
    if (!order) {
        return <Page><Card><CardBody><Empty text={err ?? t.common.loading} /></CardBody></Card></Page>
    }

    const assembling = order.status === 'ASSEMBLING'
    const open = order.status === 'OFFERED' || order.status === 'PUBLISHED'
    const accepted = order.supplierOrders.find((s) => s.status !== 'CANCELLED')
    const signed = accepted?.status === 'CONTRACTED'
    const currentOffers = order.offers.filter((o) => o.dispatchRound === order.dispatchRound)
    const totalQty = order.lines.reduce((a, l) => a + l.quantity, 0)
    const dueProblem = !DATE_RE.test(due.trim()) ? t.prodDetail.dueProblem : null

    const run = async (fn: () => Promise<void>, done?: string) => {
        setBusy(true)
        try {
            await fn()
            setErr(null)
            if (done) setOk(done)
            await load()
        } catch (e) {
            setErr(errorText(t, e))
        } finally {
            setBusy(false)
        }
    }

    const offer = () => {
        if (!chosen.length) return setErr(t.prodDetail.errNoSupplier)
        if (dueProblem) return setErr(dueProblem)
        if (!window.confirm(t.prodDetail.confirmOffer(chosen.length))) return
        void run(async () => { await offerOpsOrder(order.id, chosen, due.trim()); setChosen([]) }, t.prodDetail.offered)
    }

    const publish = () => {
        if (dueProblem) return setErr(dueProblem)
        if (!window.confirm(t.prodDetail.confirmPublish)) return
        void run(() => publishOpsOrder(order.id, due.trim()).then(() => undefined), t.prodDetail.published)
    }

    const recall = () => {
        if (!window.confirm(t.prodDetail.confirmRecall)) return
        void run(() => recallOpsOrder(order.id).then(() => undefined), t.prodDetail.recalled)
    }

    const createContract = () => {
        if (!accepted) return
        void run(() => createSupplierContract(accepted.id).then(() => undefined), t.prodDetail.contractCreated)
    }

    const dropContract = () => {
        if (!accepted) return
        if (!window.confirm(t.prodDetail.confirmCancelContract)) return
        void run(() => cancelSupplierContract(accepted.id).then(() => undefined), t.prodDetail.contractCancelled)
    }

    const revoke = () => {
        if (!window.confirm(t.prodDetail.confirmRevokeSupplier(accepted?.supplierName ?? ''))) return
        void run(() => revokeOpsOrderSupplier(order.id).then(() => undefined), t.prodDetail.revokedSupplier)
    }

    const unallocate = (customerOrderPartId: string, code: string) => {
        if (!window.confirm(t.prodDetail.confirmUnallocate(code))) return
        void run(() => unallocateLine(customerOrderPartId).then(() => undefined), t.prodDetail.unallocated(code))
    }

    const remove = () => {
        void run(async () => {
            await deleteOpsDispatchOrder(order.id)
            navigate('/ops/dispatch', { replace: true })
        })
    }

    const toggle = (orgId: string, on: boolean) =>
        setChosen((c) => (on ? [...c, orgId] : c.filter((x) => x !== orgId)))

    return (
        <Page>
            <Hello back={back} title={`${t.prodDetail.title} ${shortId(order.id)}`} right={pill(opsOrderSt(t)[order.status])} />
            {err && <Banner tone="wa" style={{ marginBottom: 14 }}>{err}</Banner>}
            {ok && <Banner tone="ok" style={{ marginBottom: 14 }}>{ok}</Banner>}

            <Card style={{ marginBottom: 16 }}>
                <CardHead title={t.prodDetail.summaryTitle} />
                <CardBody>
                    <Fields>
                        <Fld k={t.prodDetail.fldLines} v={order.lines.length} mono />
                        <Fld k={t.prodDetail.fldTotalQty} v={totalQty} mono />
                        <Fld k={t.prodDetail.fldMode} v={order.dispatchMode && !assembling ? dispatchMode(t)[order.dispatchMode] : X} />
                        <Fld k={t.prodDetail.fldDue} v={!assembling && order.supplierDueDate ? order.supplierDueDate : X} mono />
                        <Fld k={t.prodDetail.fldDispatched} v={!assembling && order.dispatchedAt ? fmtDateTime(new Date(order.dispatchedAt)) : X} mono />
                        <Fld k={t.prodDetail.fldSupplier} v={accepted?.supplierName ?? X} />
                    </Fields>
                </CardBody>
            </Card>

            <Card style={{ marginBottom: 16 }}>
                <CardHead title={t.prodDetail.partsTitle} />
                {order.lines.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr><th>{t.prodDetail.colCustomerOrder}</th><th>{t.customer.orderDetail.colCode}</th><th>{t.common.table.name}</th><th>{t.prodDetail.colMaterialSurface}</th><th className="n">{t.prodDetail.colPieces}</th><th /></tr>
                            </thead>
                            <tbody>
                                {order.lines.map((l) => (
                                    <tr key={l.id}>
                                        <td className="t1">{l.customerName ?? X}<div className="t2">{l.orderTitle || t.common.untitledOrder}</div></td>
                                        <td className="m">{l.code}</td>
                                        <td>{l.partName}</td>
                                        <td>{l.material || X}<div className="t2">{l.surfaceTreatment || X}</div></td>
                                        <td className="n">{l.quantity}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            {assembling && (
                                                <button className="btn qui sm" type="button" disabled={busy}
                                                    onClick={() => unallocate(l.customerOrderPartId, l.code)}>{t.prodDetail.unallocate}</button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                ) : (
                    <CardBody>
                        <Empty text={t.prodDetail.emptyParts} sub={t.prodDetail.emptyPartsSub}
                            action={<button className="btn" type="button" disabled={busy} onClick={remove}>{t.prodDetail.deleteEmpty}</button>} />
                    </CardBody>
                )}
            </Card>

            {order.lines.length > 0 && (
                <Card style={{ marginBottom: 16 }}>
                    <CardHead title={t.prodDetail.priceTitle} />
                    {prices.length ? (
                        <CardBody flush>
                            <TableWrap>
                                <thead>
                                    <tr>{assembling && <th />}<th>{t.prodDetail.colSupplier}</th><th className="n">{t.prodDetail.colDiscount}</th><th className="n">{t.prodDetail.colSupplierTotal}</th></tr>
                                </thead>
                                <tbody>
                                    {prices.map((p) => (
                                        <tr key={p.supplierOrgId}>
                                            {assembling && (
                                                <td style={{ width: 36 }}>
                                                    <Checkbox checked={chosen.includes(p.supplierOrgId)}
                                                        onChange={(v) => toggle(p.supplierOrgId, v)}>{''}</Checkbox>
                                                </td>
                                            )}
                                            <td className="t1">{p.supplierName}</td>
                                            <td className="n">× {p.discountRate}</td>
                                            <td className="n"><b>¥ {M(p.total)}</b></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </TableWrap>
                        </CardBody>
                    ) : (
                        <CardBody><Empty text={t.prodDetail.noSupplierAvailable} sub={t.prodDetail.noSupplierAvailableSub} /></CardBody>
                    )}
                    {assembling && (
                        <CardFoot
                            left={
                                <div className="fcell">
                                    <span className="t2">{t.prodDetail.offerDueLabel}</span>
                                    <Input value={due} onChange={setDue} placeholder="2026-10-20" style={{ width: 130 }} />
                                </div>
                            }
                            right={
                                <>
                                    <button className="btn" type="button" disabled={busy || !prices.length} onClick={publish}>{t.prodDetail.publishBtn}</button>
                                    <button className="btn pri" type="button" disabled={busy || !chosen.length} onClick={offer}>
                                        {t.prodDetail.offerSelected(chosen.length)}
                                    </button>
                                </>
                            }
                        />
                    )}
                </Card>
            )}

            {(open || accepted) && (
                <Card style={{ marginBottom: 16 }}>
                    <CardHead title={open ? t.prodDetail.offersOpen : t.prodDetail.offersAccepted} />
                    <CardBody>
                        {order.status === 'OFFERED' && (
                            <TableWrap>
                                <thead><tr><th>{t.prodDetail.colOfferedTo}</th><th>{t.common.table.status}</th></tr></thead>
                                <tbody>
                                    {currentOffers.map((o) => (
                                        <tr key={o.supplierOrgId}><td>{o.supplierName ?? X}</td><td>{pill(offerSt(t)[o.status])}</td></tr>
                                    ))}
                                </tbody>
                            </TableWrap>
                        )}
                        {order.status === 'PUBLISHED' && <div className="t2">{t.prodDetail.marketNote}</div>}
                        {accepted && (
                            <>
                                <div>{t.prodDetail.acceptedNote(accepted.supplierName ?? '', fmtDateTime(new Date(accepted.acceptedAt)), accepted.supplierDueDate ?? '')}</div>
                                <div style={{ marginTop: 8 }}>{pill(supplierOrderSt(t)[accepted.status])}</div>
                                <div className="t2" style={{ marginTop: 8, lineHeight: 1.6 }}>
                                    {accepted.status === 'ACCEPTED' && <>{t.prodDetail.awaitingContract(fmtDateTime(new Date(accepted.signByDeadline)))}</>}
                                    {accepted.status === 'CONTRACT_PENDING' && <>{t.prodDetail.awaitingSignature(fmtDateTime(new Date(accepted.contractCreatedAt!)), fmtDateTime(new Date(accepted.signByDeadline)))}</>}
                                    {signed && <>{t.prodDetail.signedNote(fmtDateTime(new Date(accepted.signedAt!)))}</>}
                                </div>
                            </>
                        )}
                    </CardBody>
                    <CardFoot
                        left={accepted && !signed ? (
                            accepted.status === 'ACCEPTED'
                                ? <button className="btn pri" type="button" disabled={busy} onClick={createContract}>{t.prodDetail.createContract}</button>
                                : <button className="btn" type="button" disabled={busy} onClick={dropContract}>{t.prodDetail.dropContract}</button>
                        ) : undefined}
                        right={open
                            ? <button className="btn" type="button" disabled={busy} onClick={recall}>{t.prodDetail.recall}</button>
                            : <button className="btn" type="button" disabled={busy || signed} onClick={revoke}>{t.prodDetail.revokeSupplier}</button>} />
                </Card>
            )}

            {order.supplierOrders.some((s) => s.status === 'CANCELLED') && (
                <Card>
                    <CardHead title={t.prodDetail.cancelHistory} />
                    <CardBody flush>
                        <TableWrap>
                            <thead><tr><th>{t.prodDetail.colSupplier}</th><th>{t.common.table.status}</th><th>{t.prodDetail.colReason}</th><th className="n">{t.prodDetail.colAcceptedAt}</th><th className="n">{t.prodDetail.colCancelledAt}</th></tr></thead>
                            <tbody>
                                {order.supplierOrders.filter((s) => s.status === 'CANCELLED').map((s) => (
                                    <tr key={s.id}>
                                        <td>{s.supplierName ?? X}</td>
                                        <td>{pill(supplierOrderSt(t)[s.status])}</td>
                                        <td>{s.cancelReason ? cancelReason(t)[s.cancelReason] : X}</td>
                                        <td className="n">{fmtDateTime(new Date(s.acceptedAt))}</td>
                                        <td className="n">{s.cancelledAt ? fmtDateTime(new Date(s.cancelledAt)) : X}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                </Card>
            )}
        </Page>
    )
}
