/**
 * 报价工作台里的「AI 成本估算」（2026-11-17）。运营逐行点「估价」→ 后端读图、调看图模型、按费率表算每件成本。
 *
 * ★ 只是参考：不自动填原价，不参与对客价（需求方 2026-11-17：AI 给建议，人工确认）。
 * ★ 第一版只估机加件；AI 判断不是机加件的显示「非机加件，需人工」，不给数。
 * ★ 明细放弹框里看：类别 / 项目 / 数量 / 单价 / 数量系数 / 金额，缺费率、缺数量、AI 估的项都标出来。
 */

import { useCallback, useEffect, useState } from 'react'
import { Modal } from '../../components/Modal'
import { Banner, Card, CardBody, CardHead, Pill, TableWrap } from '../../components/ui'
import { errorText } from '../../i18n/errorText'
import { useI18n } from '../../i18n/I18nProvider'
import { fmtDateTime, X } from '../../lib/format'
import { estimateLine, listLatestEstimates, type EstimateItem, type PriceEstimateView } from '../../services'

const money = (v: number | null | undefined) => (v == null ? X : v.toFixed(2))
/**
 * 每件成本合计。合计 ≤ 0 不是一个算出来的成本（缺工时、缺费率时各项都是 0），显示占位符 ——
 * 以前这里显示 0.00，运营扫一眼会当成「成本就是 0」（2026-11-24 全流程演示里撞到）。
 */
const cost = (v: number | null | undefined) => (v == null || v <= 0 ? X : v.toFixed(2))

export function EstimateCard({ orderId, lines, editable }: {
    orderId: string
    lines: { id: string; code: string; partName: string }[]
    editable: boolean
}) {
    const { t } = useI18n()
    const e = t.estimate
    const [byLine, setByLine] = useState<Record<string, PriceEstimateView>>({})
    const [running, setRunning] = useState<string | null>(null)
    // 估价要读图 + 调模型，常常要几十秒；按钮上显示已经等了多久，免得以为卡死了
    const [elapsed, setElapsed] = useState(0)
    useEffect(() => {
        if (running === null) return
        setElapsed(0)
        const started = Date.now()
        const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
        return () => window.clearInterval(id)
    }, [running])
    const [err, setErr] = useState<string | null>(null)
    const [open, setOpen] = useState<{ code: string; view: PriceEstimateView } | null>(null)

    const load = useCallback(async () => {
        try {
            const list = await listLatestEstimates(orderId)
            setByLine(Object.fromEntries(list.map((v) => [v.lineId, v])))
        } catch (ex) {
            setErr(errorText(t, ex))
        }
    }, [orderId, t])

    useEffect(() => { void load() }, [load])

    const run = async (lineId: string) => {
        setRunning(lineId)
        setErr(null)
        try {
            const v = await estimateLine(orderId, lineId)
            setByLine((m) => ({ ...m, [lineId]: v }))
        } catch (ex) {
            setErr(errorText(t, ex))
        } finally {
            setRunning(null)
        }
    }

    const result = (v: PriceEstimateView) =>
        v.outcome === 'NOT_MACHINED' ? <Pill tone="wa">{e.stNotMachined}</Pill>
            : v.complete ? <Pill tone="ok">{e.stComplete}</Pill>
                : <Pill tone="wa">{e.stIncomplete}</Pill>

    return (
        <Card style={{ marginBottom: 16 }}>
            <CardHead title={e.title} rid={e.sub} />
            <CardBody flush>
                {err && <Banner tone="wa" style={{ margin: 12 }}>{err}</Banner>}
                <TableWrap>
                    <thead>
                        <tr>
                            <th className="n">#</th><th>{t.customer.orderDetail.colCode}</th><th>{t.quoteWork.colPart}</th>
                            <th className="n">{e.colCost}</th><th>{e.colResult}</th><th className="n">{e.colAt}</th><th />
                        </tr>
                    </thead>
                    <tbody>
                        {lines.map((l, i) => {
                            const v = byLine[l.id]
                            return (
                                <tr key={l.id}>
                                    <td className="n">{i + 1}</td>
                                    <td className="m">{l.code}</td>
                                    <td className="t1">{l.partName}</td>
                                    {/* 一项都没算出来、或合计是 0 时，那不是一个算出来的成本 —— 显示占位符 */}
                                    <td className="n">{v && v.breakdown.items.some((it) => it.amount != null) ? cost(v.unitCostCny) : X}</td>
                                    <td>{v ? result(v) : X}</td>
                                    <td className="n">{v ? fmtDateTime(new Date(v.estimatedAt)) : X}</td>
                                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                        {v && (
                                            <button className="btn sm" type="button"
                                                onClick={() => setOpen({ code: l.code, view: v })}>{e.details}</button>
                                        )}
                                        {editable && (
                                            <button className="btn sm" type="button" disabled={running !== null}
                                                onClick={() => void run(l.id)}>
                                                {running === l.id ? e.runningFor(elapsed) : v ? e.rerun : e.run}
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </TableWrap>
            </CardBody>
            {open && <EstimateDetail code={open.code} v={open.view} onClose={() => setOpen(null)} />}
        </Card>
    )
}

function EstimateDetail({ code, v, onClose }: { code: string; v: PriceEstimateView; onClose: () => void }) {
    const { t } = useI18n()
    const e = t.estimate

    const itemName = (it: EstimateItem) => (it.kind === 'FIXED' ? e.kind.FIXED : it.name || X)
    const flag = (it: EstimateItem) => {
        if (it.kind === 'FIXED') return it.missing ? e.fixedMissing : e.aiEstimated
        if (!it.missing) return null
        return it.unit == null ? e.missingRate : e.missingQty
    }

    return (
        <Modal title={e.modalTitle(code)} width={760} onClose={onClose}
            footer={<button className="btn" type="button" onClick={onClose}>{t.common.close}</button>}>
            <div className="t2" style={{ marginBottom: 10 }}>
                {e.partType}：{v.partTypeReason || X}
                {v.material && <> · {e.material}：{v.material}</>}
                {(v.netWeightKg != null || v.blankWeightKg != null) && (
                    <> · {e.weight(v.netWeightKg != null ? String(v.netWeightKg) : X,
                        v.blankWeightKg != null ? String(v.blankWeightKg) : X)}</>
                )}
            </div>

            {v.outcome === 'ESTIMATED' && (
                <>
                    <TableWrap>
                        <thead>
                            <tr>
                                <th>{e.colKind}</th><th>{e.colItem}</th><th className="n">{e.colQty}</th>
                                <th className="n">{e.colUnitPrice}</th><th className="n">{e.colFactor}</th>
                                <th className="n">{e.colAmount}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {v.breakdown.items.map((it, i) => {
                                const f = flag(it)
                                return (
                                    <tr key={i}>
                                        <td>{e.kind[it.kind] ?? it.kind}</td>
                                        <td className="t1">
                                            {itemName(it)}
                                            {f && <> <Pill tone={it.missing ? 'wa' : 'in'}>{f}</Pill></>}
                                            {it.note && <div className="t2">{it.note}</div>}
                                        </td>
                                        <td className="n">
                                            {it.quantity != null ? `${it.quantity} ${it.unit ? e.unit[it.unit] : ''}` : X}
                                        </td>
                                        <td className="n">{money(it.unitPriceCny)}</td>
                                        <td className="n">{it.factor}</td>
                                        <td className="n">{money(it.amount)}</td>
                                    </tr>
                                )
                            })}
                            <tr>
                                <td colSpan={5} className="t1">{e.total}</td>
                                <td className="n"><b>{cost(v.unitCostCny)}</b></td>
                            </tr>
                        </tbody>
                    </TableWrap>
                    {!v.complete && <Banner tone="wa" style={{ marginTop: 10 }}>{e.incompleteHint}</Banner>}
                </>
            )}

            <TextList title={e.assumptions} items={v.assumptions} />
            <TextList title={e.toConfirm} items={v.toConfirm} />
            <div className="t2" style={{ marginTop: 12 }}>
                {e.files}：{v.readFiles.join('、') || X}
                {v.skippedFiles.length > 0 && <> · {e.skipped}：{v.skippedFiles.join('、')}</>}
                {' · '}{e.model}：{v.model} · {fmtDateTime(new Date(v.estimatedAt))}
            </div>
        </Modal>
    )
}

/** 空列表整块不显示（C5：没有内容就不占位）。 */
function TextList({ title, items }: { title: string; items: string[] }) {
    if (!items.length) return null
    return (
        <div style={{ marginTop: 12 }}>
            <div className="t1" style={{ marginBottom: 4 }}>{title}</div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
                {items.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
        </div>
    )
}
