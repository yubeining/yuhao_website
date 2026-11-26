/**
 * 账号设置页里的「收货地址」卡片（2026-11-26 地址簿，只在客户端显示）。
 *
 * ★ 默认地址排第一并带「默认」标记，其余按添加顺序（后端排好）。
 * ★ 增 / 改走居中弹框（C7），删除先确认。操作后的反馈放在卡片右上角，2 秒后消失。
 * ★ 「复制」把整条地址按卡片格式复制成多行文本，原样不翻译（需求方定）。
 */

import { useCallback, useEffect, useState } from 'react'
import { addressCopyText, addressOneLine } from '../../components/addressFormat'
import { Modal } from '../../components/Modal'
import { Banner, Card, CardBody, CardHead, Pill } from '../../components/ui'
import { useAutoClear } from '../../components/useAutoClear'
import { errorText } from '../../i18n/errorText'
import { useI18n } from '../../i18n/I18nProvider'
import {
    deleteShippingAddress, listShippingAddresses, setDefaultShippingAddress, type ShippingAddressView,
} from '../../services'
import { AddressFormModal } from './AddressFormModal'

export function AddressBookCard() {
    const { t, lang } = useI18n()
    const b = t.addressBook
    const [rows, setRows] = useState<ShippingAddressView[] | null>(null)
    const [err, setErr] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [ok, setOk] = useState<string | null>(null)
    useAutoClear(ok, () => setOk(null))
    /** null = 弹框关着；'new' = 新增；否则是要编辑的那条 */
    const [editing, setEditing] = useState<ShippingAddressView | 'new' | null>(null)
    const [deleting, setDeleting] = useState<ShippingAddressView | null>(null)

    const load = useCallback(async () => {
        try {
            setRows(await listShippingAddresses())
            setErr(null)
        } catch (e) {
            setErr(errorText(t, e))
        }
    }, [t])
    useEffect(() => { void load() }, [load])

    const act = async (fn: () => Promise<unknown>, done: string) => {
        if (busy) return
        setBusy(true)
        setErr(null)
        try {
            await fn()
            await load()
            setOk(done)
        } catch (e) {
            setErr(errorText(t, e))
        } finally {
            setBusy(false)
        }
    }

    const copy = async (a: ShippingAddressView) => {
        try {
            await navigator.clipboard.writeText(addressCopyText(a, lang))
            setOk(b.copied)
        } catch {
            setErr(b.copyFailed)
        }
    }

    return (
        <Card style={{ maxWidth: 720, marginTop: 18 }}>
            <CardHead
                title={b.title}
                rid={rows && rows.length > 0 ? String(rows.length) : undefined}
                right={<>
                    {ok && <span className="t2" style={{ color: 'var(--muted)', marginRight: 10 }}>{ok}</span>}
                    <button className="btn sm pri" type="button" disabled={rows === null}
                        onClick={() => { setErr(null); setEditing('new') }}>{b.add}</button>
                </>}
            />
            <CardBody flush>
                {err && <Banner tone="wa" style={{ margin: 12 }}>{err}</Banner>}
                {rows === null && !err && <div className="t2" style={{ color: 'var(--muted)', padding: '12px 16px' }}>…</div>}
                {rows && rows.length === 0 && (
                    <div className="t2" style={{ color: 'var(--muted)', padding: '12px 16px' }}>{b.empty}</div>
                )}
                {rows && rows.map((a) => (
                    <div key={a.id} className={`addr${a.isDefault ? ' def' : ''}`}>
                        <div className="a1">
                            {a.company}
                            {a.isDefault && <Pill tone="in" dot={false}>{b.defaultTag}</Pill>}
                        </div>
                        <div className="a2">{a.contact} · <span className="m">{a.phone}</span></div>
                        <div className="a3">{addressOneLine(a, lang)}</div>
                        <div className="acts">
                            {!a.isDefault && (
                                <button className="btn qui" type="button" disabled={busy}
                                    onClick={() => void act(() => setDefaultShippingAddress(a.id), b.madeDefault)}>
                                    {b.setDefault}
                                </button>
                            )}
                            <button className="btn qui" type="button" onClick={() => void copy(a)}>{b.copy}</button>
                            <button className="btn qui" type="button" disabled={busy}
                                onClick={() => { setErr(null); setEditing(a) }}>{b.edit}</button>
                            <button className="btn qui" type="button" disabled={busy} style={{ color: 'var(--bad)' }}
                                onClick={() => setDeleting(a)}>{b.del}</button>
                        </div>
                    </div>
                ))}
            </CardBody>

            {editing && (
                <AddressFormModal initial={editing === 'new' ? null : editing}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); void load().then(() => setOk(t.common.saved)) }} />
            )}

            {deleting && (
                <Modal title={b.deleteTitle} width={360} busy={busy} onClose={() => setDeleting(null)}
                    footer={<>
                        <button className="btn" type="button" onClick={() => setDeleting(null)}>{t.shipTo.cancel}</button>
                        <button className="btn pri danger" type="button" disabled={busy}
                            onClick={() => void act(() => deleteShippingAddress(deleting.id), b.deleted)
                                .then(() => setDeleting(null))}>
                            {b.del}
                        </button>
                    </>}>
                    <div className="t1">{deleting.company}</div>
                    <div className="t2" style={{ color: 'var(--muted)' }}>{addressOneLine(deleting, lang)}</div>
                    <p className="t2" style={{ margin: '12px 0 0' }}>{b.deleteBody}</p>
                </Modal>
            )}
        </Card>
    )
}
