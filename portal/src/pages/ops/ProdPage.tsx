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
import { CANCEL_REASON, DISPATCH_MODE, OFFER_ST, OPS_ORDER_ST, shortId, SUPPLIER_ORDER_ST } from './dispatchStatus'

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

    const back = <Link className="btn sm qui" to="/ops/dispatch" style={{ margin: '0 0 6px -9px' }}>← 派单管理</Link>

    if (missing) {
        return <Page><Hello back={back} title="生产订单" /><Card><CardBody><Empty text="生产订单不存在" /></CardBody></Card></Page>
    }
    if (!order) {
        return <Page><Card><CardBody><Empty text={err ?? '加载中…'} /></CardBody></Card></Page>
    }

    const assembling = order.status === 'ASSEMBLING'
    const open = order.status === 'OFFERED' || order.status === 'PUBLISHED'
    const accepted = order.supplierOrders.find((s) => s.status !== 'CANCELLED')
    const signed = accepted?.status === 'CONTRACTED'
    const currentOffers = order.offers.filter((o) => o.dispatchRound === order.dispatchRound)
    const totalQty = order.lines.reduce((a, l) => a + l.quantity, 0)
    const dueProblem = !DATE_RE.test(due.trim()) ? '请填对供交期（如 2026-10-20）' : null

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
        if (!chosen.length) return setErr('请勾选要派的供应商')
        if (dueProblem) return setErr(dueProblem)
        if (!window.confirm(`定向派给 ${chosen.length} 家？先到先得，谁先接给谁。`)) return
        void run(async () => { await offerOpsOrder(order.id, chosen, due.trim()); setChosen([]) }, '已定向派出')
    }

    const publish = () => {
        if (dueProblem) return setErr(dueProblem)
        if (!window.confirm('挂到全市场？所有可派单的供应商都看得到，先到先得。')) return
        void run(() => publishOpsOrder(order.id, due.trim()).then(() => undefined), '已挂全市场')
    }

    const recall = () => {
        if (!window.confirm('收回？还没人接，收回后回到组装中。')) return
        void run(() => recallOpsOrder(order.id).then(() => undefined), '已收回')
    }

    const createContract = () => {
        if (!accepted) return
        void run(() => createSupplierContract(accepted.id).then(() => undefined), '合同已建，等供应商签字')
    }

    const dropContract = () => {
        if (!accepted) return
        if (!window.confirm('作废这份合同？回到「已接单、等合同」，可以重新建。')) return
        void run(() => cancelSupplierContract(accepted.id).then(() => undefined), '合同已作废')
    }

    const revoke = () => {
        if (!window.confirm(`收回「${accepted?.supplierName ?? ''}」接的单？对方的单会取消，这张回到组装中重派。`)) return
        void run(() => revokeOpsOrderSupplier(order.id).then(() => undefined), '已收回供应商')
    }

    const unallocate = (customerOrderPartId: string, code: string) => {
        if (!window.confirm(`撤回「${code}」的分配？这一行拆出去的所有份会一起撤回待派。`)) return
        void run(() => unallocateLine(customerOrderPartId).then(() => undefined), `「${code}」已撤回`)
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
            <Hello back={back} title={`生产订单 ${shortId(order.id)}`} right={pill(OPS_ORDER_ST[order.status])} />
            {err && <Banner tone="wa" style={{ marginBottom: 14 }}>{err}</Banner>}
            {ok && <Banner tone="ok" style={{ marginBottom: 14 }}>{ok}</Banner>}

            <Card style={{ marginBottom: 16 }}>
                <CardHead title="概况" />
                <CardBody>
                    <Fields>
                        <Fld k="零件行" v={order.lines.length} mono />
                        <Fld k="总件数" v={totalQty} mono />
                        <Fld k="派法" v={order.dispatchMode && !assembling ? DISPATCH_MODE[order.dispatchMode] : X} />
                        <Fld k="对供交期" v={!assembling && order.supplierDueDate ? order.supplierDueDate : X} mono />
                        <Fld k="派出时间" v={!assembling && order.dispatchedAt ? fmtDateTime(new Date(order.dispatchedAt)) : X} mono />
                        <Fld k="接单方" v={accepted?.supplierName ?? X} />
                    </Fields>
                </CardBody>
            </Card>

            <Card style={{ marginBottom: 16 }}>
                <CardHead title="零件" />
                {order.lines.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr><th>客户 / 订单</th><th>图号</th><th>名称</th><th>材料 / 表面处理</th><th className="n">件数</th><th /></tr>
                            </thead>
                            <tbody>
                                {order.lines.map((l) => (
                                    <tr key={l.id}>
                                        <td className="t1">{l.customerName ?? X}<div className="t2">{l.orderTitle || '未命名订单'}</div></td>
                                        <td className="m">{l.code}</td>
                                        <td>{l.partName}</td>
                                        <td>{l.material || X}<div className="t2">{l.surfaceTreatment || X}</div></td>
                                        <td className="n">{l.quantity}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            {assembling && (
                                                <button className="btn qui sm" type="button" disabled={busy}
                                                    onClick={() => unallocate(l.customerOrderPartId, l.code)}>撤回分配</button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                ) : (
                    <CardBody>
                        <Empty text="还没有零件" sub="到「派单管理」把待派的零件分配进来"
                            action={<button className="btn" type="button" disabled={busy} onClick={remove}>删除这张空单</button>} />
                    </CardBody>
                )}
            </Card>

            {order.lines.length > 0 && (
                <Card style={{ marginBottom: 16 }}>
                    <CardHead title="各家对供价（按当前折率，接单时锁定）" />
                    {prices.length ? (
                        <CardBody flush>
                            <TableWrap>
                                <thead>
                                    <tr>{assembling && <th />}<th>供应商</th><th className="n">折率</th><th className="n">对供合计 ¥</th></tr>
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
                        <CardBody><Empty text="还没有可派单的供应商" sub="到「交易方」给供应商录折率" /></CardBody>
                    )}
                    {assembling && (
                        <CardFoot
                            left={
                                <div className="fcell">
                                    <span className="t2">对供交期</span>
                                    <Input value={due} onChange={setDue} placeholder="2026-10-20" style={{ width: 130 }} />
                                </div>
                            }
                            right={
                                <>
                                    <button className="btn" type="button" disabled={busy || !prices.length} onClick={publish}>挂全市场</button>
                                    <button className="btn pri" type="button" disabled={busy || !chosen.length} onClick={offer}>
                                        定向派给选中的 {chosen.length} 家
                                    </button>
                                </>
                            }
                        />
                    )}
                </Card>
            )}

            {(open || accepted) && (
                <Card style={{ marginBottom: 16 }}>
                    <CardHead title={open ? '派单中' : '已被接下'} />
                    <CardBody>
                        {order.status === 'OFFERED' && (
                            <TableWrap>
                                <thead><tr><th>这一轮派给</th><th>状态</th></tr></thead>
                                <tbody>
                                    {currentOffers.map((o) => (
                                        <tr key={o.supplierOrgId}><td>{o.supplierName ?? X}</td><td>{pill(OFFER_ST[o.status])}</td></tr>
                                    ))}
                                </tbody>
                            </TableWrap>
                        )}
                        {order.status === 'PUBLISHED' && <div className="t2">挂在全市场，所有可派单的供应商都看得到，谁先接给谁。</div>}
                        {accepted && (
                            <>
                                <div>「<b>{accepted.supplierName}</b>」于 {fmtDateTime(new Date(accepted.acceptedAt))} 接单，对供交期 {accepted.supplierDueDate}。</div>
                                <div style={{ marginTop: 8 }}>{pill(SUPPLIER_ORDER_ST[accepted.status])}</div>
                                <div className="t2" style={{ marginTop: 8, lineHeight: 1.6 }}>
                                    {accepted.status === 'ACCEPTED' && <>还没建合同。签字期限 {fmtDateTime(new Date(accepted.signByDeadline))}（接单起 7 天），到点还没签字，系统会自动取消这张单、退回待派。</>}
                                    {accepted.status === 'CONTRACT_PENDING' && <>合同已建（{fmtDateTime(new Date(accepted.contractCreatedAt!))}），等供应商签字。签字期限 {fmtDateTime(new Date(accepted.signByDeadline))}，到点没签自动取消退回待派。</>}
                                    {signed && <>供应商已于 {fmtDateTime(new Date(accepted.signedAt!))} 签字，单据锁定：收不回、改不了。生产、质检、发货还没做。</>}
                                </div>
                            </>
                        )}
                    </CardBody>
                    <CardFoot
                        left={accepted && !signed ? (
                            accepted.status === 'ACCEPTED'
                                ? <button className="btn pri" type="button" disabled={busy} onClick={createContract}>建合同</button>
                                : <button className="btn" type="button" disabled={busy} onClick={dropContract}>作废合同</button>
                        ) : undefined}
                        right={open
                            ? <button className="btn" type="button" disabled={busy} onClick={recall}>收回</button>
                            : <button className="btn" type="button" disabled={busy || signed} onClick={revoke}>收回供应商</button>} />
                </Card>
            )}

            {order.supplierOrders.some((s) => s.status === 'CANCELLED') && (
                <Card>
                    <CardHead title="取消记录" />
                    <CardBody flush>
                        <TableWrap>
                            <thead><tr><th>供应商</th><th>状态</th><th>原因</th><th className="n">接单</th><th className="n">取消</th></tr></thead>
                            <tbody>
                                {order.supplierOrders.filter((s) => s.status === 'CANCELLED').map((s) => (
                                    <tr key={s.id}>
                                        <td>{s.supplierName ?? X}</td>
                                        <td>{pill(SUPPLIER_ORDER_ST[s.status])}</td>
                                        <td>{s.cancelReason ? CANCEL_REASON[s.cancelReason] : X}</td>
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
