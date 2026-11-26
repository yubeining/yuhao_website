/**
 * 客户订单详情里的收货地址：只读卡片 + 「编辑」→ 居中弹框，从地址簿里选一条（CLAUDE.md §10 C7）。
 *
 * ★ 2026-11-23 拍板：提交订单时必填；订单就绪（READY）之前都能改，就绪 / 已取消后只读。
 * ★ 2026-11-26 改成地址簿：建草稿时后端自动带上默认地址；这里只能从地址簿换（Q5），不在订单上手填。
 *   选中后后端把整条地址复制进订单（快照），之后改地址簿不影响这张订单。
 * ★ 弹框里可以「+ 新增地址」，存进地址簿后直接选中（P3）。
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { addressOneLine } from '../../components/addressFormat'
import { Modal } from '../../components/Modal'
import { ShipToCard } from '../../components/ShipToCard'
import { Banner, Pill } from '../../components/ui'
import { useAutoClear } from '../../components/useAutoClear'
import { errorText } from '../../i18n/errorText'
import { useI18n } from '../../i18n/I18nProvider'
import {
    listShippingAddresses, updateShipTo, type OrderStatus, type OrderView, type ShippingAddressView,
} from '../../services'
import { AddressFormModal } from './AddressFormModal'

const EDITABLE: OrderStatus[] = ['DRAFT', 'SUBMITTED', 'QUOTED', 'CONFIRMED']

export function ShipToEditor({ order, onSaved }: { order: OrderView; onSaved: (o: OrderView) => void }) {
    const { t, lang } = useI18n()
    const s = t.shipTo
    const b = t.addressBook
    /** null = 弹框关着 */
    const [book, setBook] = useState<ShippingAddressView[] | null>(null)
    const [picked, setPicked] = useState<string | null>(null)
    const [adding, setAdding] = useState(false)
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    // 保存成功的反馈放在本卡片上，2 秒后自己消失（C7）
    const [ok, setOk] = useState<string | null>(null)
    useAutoClear(ok, () => setOk(null))

    const editable = EDITABLE.includes(order.status)
    const close = () => { if (!busy) { setBook(null); setErr(null) } }

    const open = async () => {
        setErr(null)
        setBusy(true)
        try {
            const list = await listShippingAddresses()
            setBook(list)
            setPicked(list.find((a) => a.isDefault)?.id ?? list[0]?.id ?? null)
        } catch (e) {
            setOk(null)
            setErr(errorText(t, e))
        } finally {
            setBusy(false)
        }
    }

    const use = async () => {
        if (!picked) return
        setBusy(true)
        try {
            onSaved(await updateShipTo(order.id, picked))
            setBook(null)
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
                        <button className="btn sm" type="button" disabled={busy} onClick={() => void open()}>
                            {order.shipTo ? s.edit : s.fill}
                        </button>
                    )}
                </>}
                note={order.status === 'READY' ? s.lockedNote : (!book && err) ? err : undefined} />
            {book && !adding && (
                <Modal title={b.pickTitle} width={480} busy={busy} onClose={close}
                    footer={<>
                        <Link className="linkbtn" to="/customer/settings" style={{ marginRight: 'auto' }}>{b.manage}</Link>
                        <button className="btn" type="button" onClick={close}>{s.cancel}</button>
                        <button className="btn pri" type="button" disabled={busy || !picked} onClick={() => void use()}>
                            {busy ? '…' : b.use}
                        </button>
                    </>}>
                    {book.length === 0 && <div className="t2" style={{ color: 'var(--muted)' }}>{b.pickEmpty}</div>}
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
                            onClick={() => { setErr(null); setAdding(true) }}>{b.add}</button>
                    </div>
                    {err && <Banner tone="wa" style={{ marginTop: 12 }}>{err}</Banner>}
                </Modal>
            )}
            {book && adding && (
                <AddressFormModal
                    onClose={() => setAdding(false)}
                    onSaved={(saved) => {
                        // 存进地址簿后回到选择弹框，并直接选中刚加的这条（P3）
                        setBook((list) => [...(list ?? []).map((a) => saved.isDefault ? { ...a, isDefault: false } : a), saved])
                        setPicked(saved.id)
                        setAdding(false)
                    }} />
            )}
        </>
    )
}
