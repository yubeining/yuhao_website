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
        if (raw && (!RATE_RE.test(raw) || Number(raw) <= 0)) return setErr('折率请填大于 0、最多 4 位小数的数字，如 0.8')
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
            setOk(`「${current.name}」已保存`)
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
            <Hello title="交易方" />
            {err && <Banner tone="wa" style={{ marginBottom: 14 }}>{err}</Banner>}
            {ok && <Banner tone="ok" style={{ marginBottom: 14 }}>{ok}</Banner>}

            <Card style={{ marginBottom: 16 }}>
                <CardHead title="供应商" rid={suppliers ? `${suppliers.length} 家` : undefined} />
                {suppliers === null ? (
                    <CardBody><Empty text="加载中…" /></CardBody>
                ) : suppliers.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>企业</th><th className="n">折率</th><th>工艺</th><th>材料</th>
                                    <th>尺寸范围</th><th>精度等级</th><th>可派单</th><th className="n">入驻</th><th />
                                </tr>
                            </thead>
                            <tbody>
                                {suppliers.map((s) => (
                                    <tr key={s.orgId}>
                                        <td className="t1">{s.name}{s.status === 'DISABLED' && <div className="t2">已停用</div>}</td>
                                        <td className="n">{s.discountRate != null ? `× ${s.discountRate}` : '未设置'}</td>
                                        <td>{s.processes || X}</td>
                                        <td>{s.materials || X}</td>
                                        <td>{s.sizeRange || X}</td>
                                        <td>{s.precisionGrade || X}</td>
                                        <td>{s.dispatchable ? pill(['ok', '可派单']) : pill(['wa', s.status === 'DISABLED' ? '已停用' : '缺折率'])}</td>
                                        <td className="n">{fmtDate(new Date(s.createdAt))}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            <button className="btn qui sm" type="button" onClick={() => open(s)}>编辑</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                ) : (
                    <CardBody><Empty text="还没有供应商" sub="在「供应商入驻」发邀请，对方注册后会出现在这里" /></CardBody>
                )}
            </Card>

            {current && draft && (
                <Card>
                    <CardHead title={`编辑：${current.name}`} />
                    <CardBody>
                        <FieldRow cols={2}>
                            <Field label="折率（对供价 = 原价 × 折率，0.8 = 八折）">
                                <Input value={draft.discount} onChange={set('discount')} placeholder="如 0.8" />
                            </Field>
                            <Field label="工艺"><Input value={draft.processes} onChange={set('processes')} placeholder="自由填写" /></Field>
                        </FieldRow>
                        <FieldRow cols={3}>
                            <Field label="材料"><Input value={draft.materials} onChange={set('materials')} /></Field>
                            <Field label="尺寸范围"><Input value={draft.sizeRange} onChange={set('sizeRange')} /></Field>
                            <Field label="精度等级"><Input value={draft.precisionGrade} onChange={set('precisionGrade')} /></Field>
                        </FieldRow>
                        <div className="t2" style={{ marginTop: 6 }}>折率录好这家就能被派单；能力可以以后补，只给派单时参考。</div>
                    </CardBody>
                    <CardFoot
                        left={<button className="btn" type="button" onClick={() => setEditing(null)}>取消</button>}
                        right={<button className="btn pri" type="button" disabled={busy} onClick={() => void save()}>保存</button>}
                    />
                </Card>
            )}
        </Page>
    )
}
