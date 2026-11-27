/**
 * 新增 / 编辑一条收货地址（2026-11-26 地址簿）。居中小弹框（CLAUDE.md §10 C7）。
 *
 * ★ 字段、必填项、文案照原来订单上的收货地址弹框：国家、收货公司、收货人、电话、地址、城市必填；
 *   地址第二行、州/省、邮编选填。后端也按同样的规则校验，这里只是提前拦一下。
 * ★ 智能粘贴（P2）：后端调 AI 拆字段，只往表单里填，不保存；用户检查后自己点保存。
 *   拆出来的字段覆盖对应栏，没拆出来的栏保持原样。
 * ★ 默认地址不能直接取消（有地址就总有一个默认，Q8），所以编辑默认地址时勾选框是勾上且不能点的。
 */

import { useState } from 'react'
import { CountrySelect } from '../../components/CountrySelect'
import { Checkbox, Field, FieldRow, Input } from '../../components/form'
import { Modal } from '../../components/Modal'
import { Banner } from '../../components/ui'
import { errorText } from '../../i18n/errorText'
import { useI18n } from '../../i18n/I18nProvider'
import {
    createShippingAddress, parseShippingAddress, updateShippingAddress,
    type ParsedAddress, type ShippingAddressView, type ShipTo,
} from '../../services'

type Key = 'country' | 'company' | 'contact' | 'phone' | 'line1' | 'line2' | 'city' | 'region' | 'postalCode'
type Form = Record<Key, string>

const KEYS: Key[] = ['country', 'company', 'contact', 'phone', 'line1', 'line2', 'city', 'region', 'postalCode']
const REQUIRED: Key[] = ['country', 'company', 'contact', 'phone', 'line1', 'city']

const toForm = (a?: Partial<Record<Key, string | null>> | null): Form => ({
    country: a?.country ?? '', company: a?.company ?? '', contact: a?.contact ?? '', phone: a?.phone ?? '',
    line1: a?.line1 ?? '', line2: a?.line2 ?? '', city: a?.city ?? '', region: a?.region ?? '',
    postalCode: a?.postalCode ?? '',
})

/**
 * 两种用法：
 *   - 地址簿（默认）：新增 / 编辑一条，存进地址簿 → onSaved
 *   - 订单上的地址（传 shipTo + onSaveShipTo，2026-11-27）：只改这个订单的那一份，不碰地址簿，没有「设为默认」
 */
export function AddressFormModal({ initial, shipTo, onClose, onSaved, onSaveShipTo }: {
    /** 不传 = 新增 */
    initial?: ShippingAddressView | null
    /** 订单上现在的地址 */
    shipTo?: ShipTo | null
    onClose: () => void
    onSaved?: (saved: ShippingAddressView) => void
    /** 订单模式：抛错时错误显示在本弹框里 */
    onSaveShipTo?: (next: ShipTo) => void | Promise<void>
}) {
    const orderMode = !!onSaveShipTo
    const { t } = useI18n()
    const s = t.shipTo
    const b = t.addressBook
    const [form, setForm] = useState<Form>(() => toForm(orderMode ? shipTo : initial))
    const [makeDefault, setMakeDefault] = useState(initial?.isDefault ?? false)
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [pasteText, setPasteText] = useState('')
    const [pasteNote, setPasteNote] = useState<string | null>(null)

    const set = (k: Key) => (v: string) => { setForm((f) => ({ ...f, [k]: v })); setErr(null) }
    const close = () => { if (!busy) onClose() }

    const runPaste = async () => {
        if (!pasteText.trim() || busy) return
        setBusy(true)
        setErr(null)
        setPasteNote(null)
        try {
            const parsed: ParsedAddress = await parseShippingAddress(pasteText.trim())
            const found = KEYS.filter((k) => typeof parsed[k] === 'string' && parsed[k])
            setForm((f) => {
                const next = { ...f }
                for (const k of found) next[k] = parsed[k] as string
                return next
            })
            setPasteNote(found.length ? b.pasteDone : b.pasteNothing)
        } catch (e) {
            setErr(errorText(t, e))
        } finally {
            setBusy(false)
        }
    }

    const save = async () => {
        if (REQUIRED.some((k) => !form[k].trim())) { setErr(s.requiredMissing); return }
        const opt = (v: string) => v.trim() || null
        const input = {
            country: form.country, company: form.company.trim(), contact: form.contact.trim(),
            phone: form.phone.trim(), line1: form.line1.trim(), line2: opt(form.line2), city: form.city.trim(),
            region: opt(form.region), postalCode: opt(form.postalCode), makeDefault,
        }
        setBusy(true)
        try {
            if (onSaveShipTo) {
                await onSaveShipTo({
                    country: input.country, company: input.company, contact: input.contact, phone: input.phone,
                    line1: input.line1, line2: input.line2, city: input.city, region: input.region,
                    postalCode: input.postalCode,
                })
            } else {
                onSaved?.(initial ? await updateShippingAddress(initial.id, input) : await createShippingAddress(input))
            }
        } catch (e) {
            setErr(errorText(t, e))
        } finally {
            setBusy(false)
        }
    }

    return (
        <Modal title={orderMode ? s.title : initial ? b.editTitle : b.newTitle} width={480} busy={busy} onClose={close}
            footer={<>
                <button className="btn" type="button" onClick={close}>{s.cancel}</button>
                <button className="btn pri" type="button" disabled={busy} onClick={() => void save()}>
                    {busy ? '…' : s.save}
                </button>
            </>}>
            <Field label={b.paste}>
                <textarea className="inp" rows={3} value={pasteText} aria-label={b.paste}
                    onChange={(e) => { setPasteText(e.target.value); setPasteNote(null) }} />
            </Field>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 6 }}>
                <div className="t2" style={{ color: 'var(--muted)', flex: 1 }}>{pasteNote ?? b.pasteHint}</div>
                <button className="btn sm" type="button" disabled={busy || !pasteText.trim()}
                    onClick={() => void runPaste()}>{b.pasteRun}</button>
            </div>

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
            {!orderMode && (
                <div className="inprow" style={{ justifyContent: 'flex-start' }}>
                    {initial?.isDefault
                        ? <label><input type="checkbox" checked disabled /> {b.makeDefault}</label>
                        : <Checkbox checked={makeDefault} onChange={setMakeDefault}>{b.makeDefault}</Checkbox>}
                </div>
            )}
            {err && <Banner tone="wa" style={{ marginTop: 12 }}>{err}</Banner>}
        </Modal>
    )
}
