/**
 * 费率表（运营）—— AI 成本估算按这里的单价算钱（2026-11-17）。
 *
 * ★ 初始值来自《报价逻辑与方法手册》2026-11-15 第二章，区间取中间值，原文在「备注」里。
 * ★ AI 只认名称：估算时把这张表的名称和单位发给模型，模型照名称挑；对不上的项在估算明细里显示「缺费率」。
 *   所以改名称会让之前对得上的项对不上 —— 估算快照不受影响，只影响之后的估算。
 * ★ 编辑走「只读 → 编辑 → 居中弹框」（CLAUDE.md §10 C7）。
 */

import { useCallback, useEffect, useState } from 'react'
import { useAutoClear } from '../../components/useAutoClear'
import { useConfirm } from '../../components/ConfirmDialog'
import { Modal } from '../../components/Modal'
import { Field, Input } from '../../components/form'
import {
    Banner, Card, CardBody, CardHead, Empty, Hello, Page, Pending, TableWrap,
} from '../../components/ui'
import { errorText } from '../../i18n/errorText'
import { useI18n } from '../../i18n/I18nProvider'
import { fmtDateTime } from '../../lib/format'
import {
    createCostRate, deleteCostRate, listCostRates, updateCostRate,
    type CostRateKind, type CostRateUnit, type CostRateView,
} from '../../services'

const PRICE_RE = /^\d+(\.\d{1,2})?$/
const KINDS: CostRateKind[] = ['MATERIAL', 'PROCESS', 'OUTSOURCE']
const UNITS: CostRateUnit[] = ['KG', 'HOUR', 'PIECE', 'BATCH']

type Form = { id?: string; kind: CostRateKind; name: string; unit: CostRateUnit; price: string; note: string }

export function OpsCostRatesPage() {
    const { t } = useI18n()
    const c = t.costRates
    const [askConfirm, confirmDialog] = useConfirm()
    const [rows, setRows] = useState<CostRateView[] | null>(null)
    const [kind, setKind] = useState<CostRateKind | ''>('')
    const [err, setErr] = useState<string | null>(null)
    const [ok, setOk] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [form, setForm] = useState<Form | null>(null)

    const load = useCallback(async () => {
        try {
            setRows(await listCostRates())
            setErr(null)
        } catch (e) {
            setErr(errorText(t, e))
        }
    }, [t])

    useEffect(() => { void load() }, [load])
    useAutoClear(ok, () => setOk(null))

    const open = (f: Form) => {
        setErr(null)
        setForm(f)
    }

    const priceBad = !!form && form.price.trim() !== ''
        && (!PRICE_RE.test(form.price.trim()) || Number(form.price.trim()) <= 0)
    const formProblem = !form ? null
        : !form.name.trim() ? c.errName
            : !PRICE_RE.test(form.price.trim()) || Number(form.price.trim()) <= 0 ? c.errPrice
                : null

    const save = async () => {
        if (!form || formProblem) return
        setBusy(true)
        try {
            const input = {
                kind: form.kind, name: form.name.trim(),
                // 材料只能按 kg 计价（后端也校验）
                unit: form.kind === 'MATERIAL' ? 'KG' as const : form.unit,
                unitPriceCny: Number(form.price.trim()), note: form.note.trim() || null,
            }
            if (form.id) await updateCostRate(form.id, input)
            else await createCostRate(input)
            setForm(null)
            setOk(form.id ? c.saved : c.created)
            await load()
        } catch (e) {
            setErr(errorText(t, e))
        } finally {
            setBusy(false)
        }
    }

    const remove = async (r: CostRateView) => {
        if (!(await askConfirm(c.confirmDelete(r.name), { danger: true }))) return
        setBusy(true)
        try {
            await deleteCostRate(r.id)
            setOk(c.deleted(r.name))
            await load()
        } catch (e) {
            setErr(errorText(t, e))
        } finally {
            setBusy(false)
        }
    }

    const shown = rows?.filter((r) => !kind || r.kind === kind) ?? null

    return (
        <Page>
            <Hello title={c.title} sub={c.sub} />
            {err && rows !== null && !form && <Banner tone="wa" style={{ marginBottom: 14 }}>{err}</Banner>}
            {ok && <Banner tone="ok" style={{ marginBottom: 14 }}>{ok}</Banner>}

            <Card>
                <CardHead title={c.title}
                    right={
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                            <select className="inp" value={kind} style={{ width: 110 }}
                                aria-label={c.colKind}
                                onChange={(e) => setKind(e.target.value as CostRateKind | '')}>
                                <option value="">{c.all}</option>
                                {KINDS.map((k) => <option key={k} value={k}>{c.kind[k]}</option>)}
                            </select>
                            <button className="btn sm pri" type="button"
                                onClick={() => open({ kind: kind || 'MATERIAL', name: '', unit: 'KG', price: '', note: '' })}>
                                {c.create}
                            </button>
                        </span>
                    } />
                <CardBody flush>
                    {shown === null ? (
                        <Pending err={err} onRetry={() => void load()} />
                    ) : shown.length ? (
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>{c.colKind}</th><th>{c.colName}</th><th>{c.colUnit}</th>
                                    <th className="n">{c.colPrice}</th><th>{c.colNote}</th>
                                    <th className="n">{c.colUpdated}</th><th />
                                </tr>
                            </thead>
                            <tbody>
                                {shown.map((r) => (
                                    <tr key={r.id}>
                                        <td>{c.kind[r.kind]}</td>
                                        <td className="t1">{r.name}</td>
                                        <td>{c.unit[r.unit]}</td>
                                        <td className="n">{r.unitPriceCny.toFixed(2)}</td>
                                        <td className="t2">{r.note || '—'}</td>
                                        <td className="n">{fmtDateTime(new Date(r.updatedAt))}</td>
                                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                            <button className="btn sm" type="button"
                                                onClick={() => open({
                                                    id: r.id, kind: r.kind, name: r.name, unit: r.unit,
                                                    price: String(r.unitPriceCny), note: r.note ?? '',
                                                })}>
                                                {c.edit}
                                            </button>
                                            <button className="btn sm" type="button" disabled={busy}
                                                onClick={() => void remove(r)}>{c.del}</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    ) : (
                        <Empty text={kind ? t.common.noMatch : c.empty} />
                    )}
                </CardBody>
            </Card>

            {form && (
                <Modal title={form.id ? c.editTitle : c.newTitle} width={400} busy={busy}
                    onClose={() => setForm(null)}
                    footer={<>
                        <button className="btn" type="button" onClick={() => setForm(null)}>{c.cancel}</button>
                        <button className="btn pri" type="button" disabled={busy || !!formProblem}
                            onClick={() => void save()}>{c.save}</button>
                    </>}>
                    {/* 保存失败的提示放在弹框里 —— 页面上那条在遮罩后面 */}
                    {err && <Banner tone="wa" style={{ marginBottom: 12 }}>{err}</Banner>}
                    <Field label={c.colKind}>
                        <select className="inp" value={form.kind}
                            onChange={(e) => {
                                const k = e.target.value as CostRateKind
                                setForm({ ...form, kind: k, unit: k === 'MATERIAL' ? 'KG' : form.unit })
                            }}>
                            {KINDS.map((k) => <option key={k} value={k}>{c.kind[k]}</option>)}
                        </select>
                    </Field>
                    <Field label={c.colName}>
                        <Input value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
                    </Field>
                    <Field label={c.colUnit}>
                        <select className="inp" value={form.kind === 'MATERIAL' ? 'KG' : form.unit}
                            disabled={form.kind === 'MATERIAL'}
                            onChange={(e) => setForm({ ...form, unit: e.target.value as CostRateUnit })}>
                            {UNITS.map((u) => <option key={u} value={u}>{c.unit[u]}</option>)}
                        </select>
                    </Field>
                    <Field label={c.colPrice}>
                        <Input value={form.price} bad={priceBad} style={{ width: 140 }}
                            onChange={(v) => setForm({ ...form, price: v })} />
                    </Field>
                    <Field label={c.colNote}>
                        <Input value={form.note} onChange={(v) => setForm({ ...form, note: v })} />
                    </Field>
                </Modal>
            )}
            {confirmDialog}
        </Page>
    )
}
