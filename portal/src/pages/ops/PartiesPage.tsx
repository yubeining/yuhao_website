/**
 * 交易方 —— 目前只有供应商：折率和能力（2026-09-18 拍板）。
 *
 * ★ 折率：对供价 = 原价 × 折率，0.8 = 乘 0.8。录好折率这家才能被派单（「可派单」列）。
 * ★ 能力（工艺 / 材料 / 尺寸范围 / 精度等级）是自由文本，派单时列给运营看，系统不判断匹配。
 * ★ 以前这一页是原型（级别、设备、可抢范围都是演示数据），已换成真数据；原型里的「级别」需求方没定过，不再显示。
 */

import { useCallback, useEffect, useState } from 'react'
import { Field, FieldRow, Input } from '../../components/form'
import {
    Banner, Card, CardBody, CardFoot, CardHead, Empty, Hello, Page, pill, TableWrap,
} from '../../components/ui'
import { errorText } from '../../i18n/errorText'
import { useMock } from '../../mock/MockProvider'
import { fmtDate, X } from '../../mock/format'
import { listSuppliers, setSupplierCapability, setSupplierDiscount, type SupplierView } from '../../services'

const RATE_RE = /^\d+(\.\d{1,4})?$/

interface Draft {
    discount: string
    processes: string
    materials: string
    sizeRange: string
    precisionGrade: string
}

const draftOf = (s: SupplierView): Draft => ({
    discount: s.discountRate != null ? String(s.discountRate) : '',
    processes: s.processes ?? '',
    materials: s.materials ?? '',
    sizeRange: s.sizeRange ?? '',
    precisionGrade: s.precisionGrade ?? '',
})

export function OpsPartiesPage() {
    const { t } = useMock()
    const [suppliers, setSuppliers] = useState<SupplierView[] | null>(null)
    const [editing, setEditing] = useState<string | null>(null)
    const [draft, setDraft] = useState<Draft | null>(null)
    const [err, setErr] = useState<string | null>(null)
    const [ok, setOk] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    const load = useCallback(async () => {
        try {
            setSuppliers(await listSuppliers())
        } catch (e) {
            setErr(errorText(t, e))
        }
    }, [t])

    useEffect(() => { void load() }, [load])

    const current = suppliers?.find((s) => s.orgId === editing) ?? null

    const open = (s: SupplierView) => {
        setEditing(s.orgId)
        setDraft(draftOf(s))
        setOk(null)
        setErr(null)
    }

    const save = async () => {
        if (!current || !draft) return
        const raw = draft.discount.trim()
        if (raw && (!RATE_RE.test(raw) || Number(raw) <= 0)) return setErr(t.ops.parties.errDiscount)
        setBusy(true)
        try {
            if (raw && Number(raw) !== current.discountRate) {
                await setSupplierDiscount(current.orgId, Number(raw))
            }
            const cap = {
                processes: draft.processes.trim() || null,
                materials: draft.materials.trim() || null,
                sizeRange: draft.sizeRange.trim() || null,
                precisionGrade: draft.precisionGrade.trim() || null,
            }
            if (cap.processes !== (current.processes ?? null) || cap.materials !== (current.materials ?? null)
                || cap.sizeRange !== (current.sizeRange ?? null) || cap.precisionGrade !== (current.precisionGrade ?? null)) {
                await setSupplierCapability(current.orgId, cap)
            }
            await load()
            setOk(t.ops.parties.saved(current.name))
            setErr(null)
            setEditing(null)
        } catch (e) {
            setErr(errorText(t, e))
        } finally {
            setBusy(false)
        }
    }

    const set = (k: keyof Draft) => (v: string) => setDraft((d) => (d ? { ...d, [k]: v } : d))

    return (
        <Page>
            <Hello title={t.ops.parties.title} />
            {err && <Banner tone="wa" style={{ marginBottom: 14 }}>{err}</Banner>}
            {ok && <Banner tone="ok" style={{ marginBottom: 14 }}>{ok}</Banner>}

            <Card style={{ marginBottom: 16 }}>
                <CardHead title={t.ops.parties.suppliers} rid={suppliers ? t.ops.parties.supplierCount(suppliers.length) : undefined} />
                {suppliers === null ? (
                    <CardBody><Empty text={t.common.loading} /></CardBody>
                ) : suppliers.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>{t.ops.parties.colCompany}</th><th className="n">{t.ops.parties.colDiscount}</th><th>{t.ops.parties.colProcess}</th><th>{t.ops.parties.colMaterial}</th>
                                    <th>{t.ops.parties.colSize}</th><th>{t.ops.parties.colPrecision}</th><th>{t.ops.parties.colDispatchable}</th><th className="n">{t.ops.parties.colOnboarded}</th><th />
                                </tr>
                            </thead>
                            <tbody>
                                {suppliers.map((s) => (
                                    <tr key={s.orgId}>
                                        <td className="t1">{s.name}{s.status === 'DISABLED' && <div className="t2">{t.ops.parties.disabled}</div>}</td>
                                        <td className="n">{s.discountRate != null ? `× ${s.discountRate}` : t.ops.parties.notSet}</td>
                                        <td>{s.processes || X}</td>
                                        <td>{s.materials || X}</td>
                                        <td>{s.sizeRange || X}</td>
                                        <td>{s.precisionGrade || X}</td>
                                        <td>{s.dispatchable ? pill(['ok', t.ops.parties.canDispatch]) : pill(['wa', s.status === 'DISABLED' ? t.ops.parties.disabled : t.ops.parties.missingDiscount])}</td>
                                        <td className="n">{fmtDate(new Date(s.createdAt))}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            <button className="btn qui sm" type="button" onClick={() => open(s)}>{t.ops.parties.edit}</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                ) : (
                    <CardBody><Empty text={t.ops.parties.empty} sub={t.ops.parties.emptySub} /></CardBody>
                )}
            </Card>

            {current && draft && (
                <Card>
                    <CardHead title={t.ops.parties.editTitle(current.name)} />
                    <CardBody>
                        <FieldRow cols={2}>
                            <Field label={t.ops.parties.fldDiscount}>
                                <Input value={draft.discount} onChange={set('discount')} placeholder={t.ops.parties.discountPlaceholder} />
                            </Field>
                            <Field label={t.ops.parties.fldProcess}><Input value={draft.processes} onChange={set('processes')} placeholder={t.ops.parties.freeText} /></Field>
                        </FieldRow>
                        <FieldRow cols={3}>
                            <Field label={t.ops.parties.fldMaterial}><Input value={draft.materials} onChange={set('materials')} /></Field>
                            <Field label={t.ops.parties.fldSize}><Input value={draft.sizeRange} onChange={set('sizeRange')} /></Field>
                            <Field label={t.ops.parties.fldPrecision}><Input value={draft.precisionGrade} onChange={set('precisionGrade')} /></Field>
                        </FieldRow>
                        <div className="t2" style={{ marginTop: 6 }}>{t.ops.parties.discountHint}</div>
                    </CardBody>
                    <CardFoot
                        left={<button className="btn" type="button" onClick={() => setEditing(null)}>{t.common.cancel}</button>}
                        right={<button className="btn pri" type="button" disabled={busy} onClick={() => void save()}>{t.ops.parties.save}</button>}
                    />
                </Card>
            )}
        </Page>
    )
}
