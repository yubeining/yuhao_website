/**
 * 订单的收货地址卡片（2026-11-27 改版）：只显示订单当前用的这一条地址。能改的时候右上角两个按钮：
 *   - 「修改」：直接改这个订单的地址（订单自己的一份，不同步地址簿）
 *   - 「更换」：从地址簿挑一条复制过来
 * 地址簿是空的、订单也还没有地址时，点「选择地址」直接新增一条：存进地址簿（第一条自动成为默认）并用在这个订单（照京东）。
 *
 * ★ 地址什么时候生效由父组件决定（onChange）：草稿在整页编辑里改，等页面「保存」；
 *   提交之后、就绪（READY）之前单独改，立即生效（2026-11-23 / 2026-11-27 拍板）。
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { addressOneLine } from '../../components/addressFormat'
import { Modal } from '../../components/Modal'
import { ShipToCard } from '../../components/ShipToCard'
import { Banner, Pill } from '../../components/ui'
import { errorText } from '../../i18n/errorText'
import { useI18n } from '../../i18n/I18nProvider'
import { listShippingAddresses, type ShippingAddressView, type ShipTo } from '../../services'
import { AddressFormModal } from './AddressFormModal'

/** 地址簿里的一条 → 订单上的一份拷贝 */
export const toShipTo = (a: ShippingAddressView): ShipTo => ({
    country: a.country, company: a.company, contact: a.contact, phone: a.phone, line1: a.line1,
    line2: a.line2 ?? null, city: a.city, region: a.region ?? null, postalCode: a.postalCode ?? null,
})

export function ShipToEditor({ shipTo, editable, bad, note, onChange }: {
    shipTo: ShipTo | null
    /** 显示「修改 / 更换」 */
    editable: boolean
    /** 提交检查后标红（还没地址） */
    bad?: boolean
    note?: string
    /** 返回 Promise 时（提交后立即生效），失败就留在弹框里显示错误 */
    onChange: (next: ShipTo) => void | Promise<void>
}) {
    const { t, lang } = useI18n()
    const s = t.shipTo
    const b = t.addressBook
    const e = t.customer.orderEdit
    /** null = 地址簿弹框关着 */
    const [book, setBook] = useState<ShippingAddressView[] | null>(null)
    const [picked, setPicked] = useState<string | null>(null)
    /** 'book' = 往地址簿新增；'order' = 改这个订单的地址 */
    const [form, setForm] = useState<'book' | 'order' | null>(null)
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)

    const apply = async (next: ShipTo) => {
        setBusy(true)
        try {
            await onChange(next)
            setBook(null)
            setForm(null)
            setErr(null)
        } catch (ex) {
            setErr(errorText(t, ex))
        } finally {
            setBusy(false)
        }
    }

    const openBook = async () => {
        setErr(null)
        setBusy(true)
        try {
            const list = await listShippingAddresses()
            // 地址簿是空的：直接新增一条（2026-11-27 照京东）
            if (!list.length) {
                setForm('book')
                return
            }
            setBook(list)
            setPicked(null)
        } catch (ex) {
            setErr(errorText(t, ex))
        } finally {
            setBusy(false)
        }
    }

    const closeBook = () => { if (!busy) { setBook(null); setErr(null) } }

    return (
        <>
            <div className={bad ? 'cardbad' : undefined}>
                <ShipToCard shipTo={shipTo}
                    action={editable && (shipTo
                        ? <>
                            <button className="btn sm" type="button" disabled={busy} onClick={() => setForm('order')}>{e.shipToEdit}</button>
                            {' '}<button className="btn sm" type="button" disabled={busy} onClick={() => void openBook()}>{e.shipToChange}</button>
                        </>
                        : <button className={`btn sm${bad ? ' bad' : ''}`} type="button" disabled={busy}
                            onClick={() => void openBook()}>{e.shipToPick}</button>)}
                    note={(!book && !form && err) ? err : note} />
            </div>
            {book && !form && (
                <Modal title={b.pickTitle} width={480} busy={busy} onClose={closeBook}
                    footer={<>
                        <Link className="linkbtn" to="/customer/settings" style={{ marginRight: 'auto' }}>{b.manage}</Link>
                        <button className="btn" type="button" onClick={closeBook}>{s.cancel}</button>
                        <button className="btn pri" type="button" disabled={busy || !picked}
                            onClick={() => { const a = book.find((x) => x.id === picked); if (a) void apply(toShipTo(a)) }}>
                            {busy ? '…' : b.use}
                        </button>
                    </>}>
                    <div role="radiogroup" aria-label={b.pickTitle}>
                        {book.map((a) => (
                            <label key={a.id} className={`addrpick${picked === a.id ? ' on' : ''}`}>
                                <input type="radio" name="ship-to-pick" checked={picked === a.id}
                                    onChange={() => { setPicked(a.id); setErr(null) }} />
                                <span>
                                    <span className="a1">
                                        {a.company}
                                        {a.isDefault && <Pill tone="in" dot={false}>{b.defaultTag}</Pill>}
                                    </span>
                                    <span className="a2" style={{ display: 'block' }}>
                                        {a.contact} · <span className="m">{a.phone}</span>
                                    </span>
                                    <span className="a3" style={{ display: 'block' }}>{addressOneLine(a, lang)}</span>
                                </span>
                            </label>
                        ))}
                    </div>
                    <div style={{ marginTop: 10 }}>
                        <button className="btn sm" type="button" disabled={busy}
                            onClick={() => { setErr(null); setForm('book') }}>{b.add}</button>
                    </div>
                    {err && <Banner tone="wa" style={{ marginTop: 12 }}>{err}</Banner>}
                </Modal>
            )}
            {form === 'book' && (
                <AddressFormModal
                    onClose={() => setForm(null)}
                    // 存进地址簿后直接用在这个订单
                    onSaved={(saved) => { setForm(null); void apply(toShipTo(saved)) }} />
            )}
            {form === 'order' && shipTo && (
                <AddressFormModal shipTo={shipTo}
                    onClose={() => setForm(null)}
                    // 失败时错误留在表单弹框里（AddressFormModal 自己显示）
                    onSaveShipTo={async (next) => { await onChange(next); setForm(null) }} />
            )}
        </>
    )
}
