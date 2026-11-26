/** 账号管理 · 外部用户（客户 / 供应商联系人）。只能改姓名、禁用 / 启用，不能新建。 */

import { useEffect, useState } from 'react'
import { addressOneLine } from '../../../components/addressFormat'
import { fmtIsoDate } from '../../../lib/format'
import { useConfirm } from '../../../components/ConfirmDialog'
import { Modal } from '../../../components/Modal'
import { Field, Input } from '../../../components/form'
import { Banner, Card, CardBody, CardHead, Pill, TableWrap } from '../../../components/ui'
import { errorText } from '../../../i18n/errorText'
import { useI18n } from '../../../i18n/I18nProvider'
import {
    disableAccount, listAccounts, listUserShippingAddresses, updateAccount, type AccountView,
} from '../../../services/ops/accounts'
import type { ShippingAddressView } from '../../../services'
import {
    FilterField, ListBanners, ListBody, PAGE_SIZE, ReadOnly, RowActions, StatusPill, usePagedList,
} from './shared'

const fetchUsers = (q: string, pageNo: number) => listAccounts(q, pageNo, PAGE_SIZE)

export function UsersTab() {
    const { t } = useI18n()
    const [askConfirm, confirmDialog] = useConfirm()
    const a = t.ops.accounts
    const list = usePagedList<AccountView>(fetchUsers)
    const [editing, setEditing] = useState<AccountView | null>(null)
    const [viewingAddresses, setViewingAddresses] = useState<AccountView | null>(null)

    const disable = async (row: AccountView) => {
        if (!(await askConfirm(a.confirmDisableUser(row.email), { danger: true }))) return
        await list.act(() => disableAccount(row.id), a.disabledOk(row.email))
    }
    const enable = (row: AccountView) => list.act(() => updateAccount(row.id, { status: 'ACTIVE' }), a.enabledOk(row.email))

    return (
        <>
            <ListBanners list={list} />

            <Card style={{ marginBottom: 16 }}>
                <CardBody>
                    <div className="fbar">
                        <FilterField label={a.colEmail}>
                            <Input value={list.q} onChange={list.setQ} onEnter={list.search} style={{ width: 260 }} />
                        </FilterField>
                        <button className="btn pri" type="button" disabled={list.busy} onClick={list.search}>{a.query}</button>
                    </div>
                </CardBody>
            </Card>

            <Card>
                <CardHead title={a.tabUsers} rid={list.rows ? a.usersTotal(list.total) : undefined} />
                <CardBody flush>
                    <ListBody list={list} emptyText={list.applied.q ? t.common.noMatch : a.noUsers}>
                        {(rows) => (
                            <TableWrap>
                                <thead>
                                    <tr>
                                        <th>{a.colEmail}</th><th>{a.colName}</th><th>{a.colOrg}</th>
                                        <th>{a.colStatus}</th><th>{a.colVerified}</th><th>{a.colCreated}</th><th />
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((r) => (
                                        <tr key={r.id}>
                                            <td className="m">{r.email}</td>
                                            <td className="t1">{r.displayName}</td>
                                            <td>{r.orgName ?? '—'}</td>
                                            <td>
                                                <StatusPill status={r.status}
                                                    label={r.status === 'ACTIVE' ? a.statusActive : a.statusDisabled} />
                                            </td>
                                            <td>{r.emailVerifiedAt ? fmtIsoDate(r.emailVerifiedAt) : a.unverified}</td>
                                            <td className="n">{fmtIsoDate(r.createdAt)}</td>
                                            <RowActions status={r.status} busy={list.busy}
                                                extra={r.orgType === 'CUSTOMER' && (
                                                    <button className="btn sm" type="button"
                                                        onClick={() => setViewingAddresses(r)}>{t.addressBook.opsButton}</button>
                                                )}
                                                onEdit={() => { list.setOk(null); setEditing(r) }}
                                                onDisable={() => void disable(r)}
                                                onEnable={() => void enable(r)} />
                                        </tr>
                                    ))}
                                </tbody>
                            </TableWrap>
                        )}
                    </ListBody>
                </CardBody>
            </Card>

            {editing && (
                <UserModal user={editing} busy={list.busy}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); void list.load(list.page) }} />
            )}
            {viewingAddresses && (
                <AddressBookModal user={viewingAddresses} onClose={() => setViewingAddresses(null)} />
            )}
            {confirmDialog}
        </>
    )
}

/** 客户用户的收货地址簿，只读（2026-11-26 需求方定：运营可以看，不能改）。 */
function AddressBookModal({ user, onClose }: { user: AccountView; onClose: () => void }) {
    const { t, lang } = useI18n()
    const b = t.addressBook
    const [rows, setRows] = useState<ShippingAddressView[] | null>(null)
    const [err, setErr] = useState<string | null>(null)

    useEffect(() => {
        listUserShippingAddresses(user.id).then(setRows, (e) => setErr(errorText(t, e)))
    }, [user.id, t])

    return (
        <Modal title={b.opsTitle(user.displayName)} width={480} onClose={onClose}
            footer={<button className="btn" type="button" onClick={onClose}>{t.common.close}</button>}>
            {err && <Banner tone="wa">{err}</Banner>}
            {!rows && !err && <div className="t2" style={{ color: 'var(--muted)' }}>…</div>}
            {rows && rows.length === 0 && <div className="t2" style={{ color: 'var(--muted)' }}>{b.opsEmpty}</div>}
            {rows && rows.map((a) => (
                <div key={a.id} className={`addrpick${a.isDefault ? ' on' : ''}`} style={{ cursor: 'default', gridTemplateColumns: 'minmax(0,1fr)' }}>
                    <span>
                        <span className="a1">
                            {a.company}
                            {a.isDefault && <Pill tone="in" dot={false}>{b.defaultTag}</Pill>}
                        </span>
                        <span className="a2" style={{ display: 'block' }}>{a.contact} · <span className="m">{a.phone}</span></span>
                        <span className="a3" style={{ display: 'block' }}>{addressOneLine(a, lang)}</span>
                    </span>
                </div>
            ))}
        </Modal>
    )
}

/** 编辑外部用户：只有姓名可改，邮箱 / 公司只读。 */
function UserModal({ user, busy, onClose, onSaved }: {
    user: AccountView
    busy: boolean
    onClose: () => void
    onSaved: () => void
}) {
    const { t } = useI18n()
    const a = t.ops.accounts
    const [name, setName] = useState(user.displayName)
    const [err, setErr] = useState<string | null>(null)
    /** 保存进行中：以前没有，连点两下会发两次请求 */
    const [saving, setSaving] = useState(false)

    const save = async () => {
        if (saving) return
        setErr(null)
        setSaving(true)
        try {
            await updateAccount(user.id, { displayName: name.trim() })
            onSaved()
        } catch (e) {
            setErr(errorText(t, e))
        } finally {
            setSaving(false)
        }
    }

    return (
        <Modal title={a.editUser} busy={busy || saving} width={400}
            onClose={onClose}
            footer={<>
                <button className="btn" type="button" onClick={onClose}>{a.cancel}</button>
                <button className="btn pri" type="button" disabled={busy || saving} onClick={() => void save()}>{a.save}</button>
            </>}>
            <Field label={a.colEmail}><ReadOnly value={user.email} note={a.immutable} /></Field>
            <Field label={a.colOrg}><ReadOnly value={user.orgName ?? '—'} note={a.immutable} /></Field>
            <Field label={a.fldName}>
                <Input value={name} onChange={setName} />
            </Field>
            {err && <Banner tone="wa" style={{ marginTop: 12 }}>{err}</Banner>}
        </Modal>
    )
}
