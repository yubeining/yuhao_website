/**
 * 客户订单详情里的收货地址：只读卡片 + 「填写 / 编辑」→ 居中弹框（CLAUDE.md §10 C7）。
 *
 * ★ 2026-11-23 拍板：提交订单时必填；订单就绪（READY）之前都能改，就绪 / 已取消后只读。
 * ★ 必填：国家、收货公司、收货人、电话、地址、城市；地址第二行、州/省、邮编选填（不是每个国家都用）。
 *   后端也按同样的规则校验，这里只是提前拦一下，省一次往返。
 */

import { useState } from 'react'
import { CountrySelect } from '../../components/CountrySelect'
import { Field, FieldRow, Input } from '../../components/form'
import { Modal } from '../../components/Modal'
import { ShipToCard } from '../../components/ShipToCard'
import { Banner } from '../../components/ui'
import { useAutoClear } from '../../components/useAutoClear'
import { errorText } from '../../i18n/errorText'
import { useI18n } from '../../i18n/I18nProvider'
import { updateShipTo, type OrderStatus, type OrderView, type ShipTo } from '../../services'

const EDITABLE: OrderStatus[] = ['DRAFT', 'SUBMITTED', 'QUOTED', 'CONFIRMED']

type Form = Record<keyof ShipTo, string>

const toForm = (a?: ShipTo | null): Form => ({
    country: a?.country ?? '', company: a?.company ?? '', contact: a?.contact ?? '', phone: a?.phone ?? '',
    line1: a?.line1 ?? '', line2: a?.line2 ?? '', city: a?.city ?? '', region: a?.region ?? '',
    postalCode: a?.postalCode ?? '',
})

const REQUIRED: (keyof ShipTo)[] = ['country', 'company', 'contact', 'phone', 'line1', 'city']

export function ShipToEditor({ order, onSaved }: { order: OrderView; onSaved: (o: OrderView) => void }) {
    const { t } = useI18n()
    const s = t.shipTo
    const [form, setForm] = useState<Form | null>(null)
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    // 保存成功的反馈放在本卡片上，2 秒后自己消失（C7）
    const [ok, setOk] = useState<string | null>(null)
    useAutoClear(ok, () => setOk(null))

    const editable = EDITABLE.includes(order.status)
    const set = (k: keyof ShipTo) => (v: string) => { setForm((f) => (f ? { ...f, [k]: v } : f)); setErr(null) }
    const close = () => { if (!busy) { setForm(null); setErr(null) } }

    const save = async () => {
        if (!form) return
        if (REQUIRED.some((k) => !form[k].trim())) { setErr(s.requiredMissing); return }
        const opt = (v: string) => v.trim() || null
        setBusy(true)
        try {
            onSaved(await updateShipTo(order.id, {
                country: form.country, company: form.company.trim(), contact: form.contact.trim(),
                phone: form.phone.trim(), line1: form.line1.trim(), line2: opt(form.line2), city: form.city.trim(),
                region: opt(form.region), postalCode: opt(form.postalCode),
            }))
            setForm(null)
            setErr(null)
            setOk(t.common.saved)
        } catch (e) {
            setErr(errorText(t, e))
        } finally {
            setBusy(false)
        }
    }

    return (
        <>
            <ShipToCard shipTo={order.shipTo}
                action={<>
                    {ok && <span className="t2" style={{ color: 'var(--muted)', marginRight: 10 }}>{ok}</span>}
                    {editable && (
                        <button className="btn sm" type="button" onClick={() => setForm(toForm(order.shipTo))}>
                            {order.shipTo ? s.edit : s.fill}
                        </button>
                    )}
                </>}
                note={order.status === 'READY' ? s.lockedNote : undefined} />
            {form && (
                <Modal title={s.title} width={480} busy={busy} onClose={close}
                    footer={<>
                        <button className="btn" type="button" onClick={close}>{s.cancel}</button>
                        <button className="btn pri" type="button" disabled={busy} onClick={() => void save()}>
                            {busy ? '…' : s.save}
                        </button>
                    </>}>
                    <Field label={s.country} required>
                        <CountrySelect value={form.country} allowOther={false} onChange={set('country')} />
                    </Field>
                    <Field label={s.company} required><Input value={form.company} onChange={set('company')} autoComplete="organization" /></Field>
                    <FieldRow>
                        <Field label={s.contact} required><Input value={form.contact} onChange={set('contact')} autoComplete="name" /></Field>
                        <Field label={s.phone} required><Input value={form.phone} onChange={set('phone')} type="tel" autoComplete="tel" /></Field>
                    </FieldRow>
                    <div className="t2" style={{ color: 'var(--muted)', marginTop: -4, marginBottom: 8 }}>{s.phoneHint}</div>
                    <Field label={s.line1} required><Input value={form.line1} onChange={set('line1')} autoComplete="address-line1" /></Field>
                    <Field label={s.line2}><Input value={form.line2} onChange={set('line2')} autoComplete="address-line2" /></Field>
                    <FieldRow cols={3}>
                        <Field label={s.city} required><Input value={form.city} onChange={set('city')} autoComplete="address-level2" /></Field>
                        <Field label={s.region}><Input value={form.region} onChange={set('region')} autoComplete="address-level1" /></Field>
                        <Field label={s.postalCode}><Input value={form.postalCode} onChange={set('postalCode')} autoComplete="postal-code" /></Field>
                    </FieldRow>
                    {err && <Banner tone="wa" style={{ marginTop: 12 }}>{err}</Banner>}
                </Modal>
            )}
        </>
    )
}
