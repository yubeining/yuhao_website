/** 账号管理 · 外部用户（客户 / 供应商联系人）。只能改姓名、禁用 / 启用，不能新建。 */

import { useState } from 'react'
import { useConfirm } from '../../../components/ConfirmDialog'
import { Modal } from '../../../components/Modal'
import { Field, Input } from '../../../components/form'
import { Banner, Card, CardBody, CardHead, TableWrap } from '../../../components/ui'
import { errorText } from '../../../i18n/errorText'
import { useMock } from '../../../mock/MockProvider'
import { disableAccount, listAccounts, updateAccount, type AccountView } from '../../../services/ops/accounts'
import {
    day, FilterField, ListBanners, ListBody, PAGE_SIZE, ReadOnly, RowActions, StatusPill, usePagedList,
} from './shared'

const fetchUsers = (q: string, pageNo: number) => listAccounts(q, pageNo, PAGE_SIZE)

export function UsersTab() {
    const { t } = useMock()
    const [askConfirm, confirmDialog] = useConfirm()
    const a = t.ops.accounts
    const list = usePagedList<AccountView>(fetchUsers)
    const [editing, setEditing] = useState<AccountView | null>(null)

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
                                            <td>{r.emailVerifiedAt ? day(r.emailVerifiedAt) : a.unverified}</td>
                                            <td className="n">{day(r.createdAt)}</td>
                                            <RowActions status={r.status} busy={list.busy}
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
            {confirmDialog}
        </>
    )
}

/** 编辑外部用户：只有姓名可改，邮箱 / 公司只读。 */
function UserModal({ user, busy, onClose, onSaved }: {
    user: AccountView
    busy: boolean
    onClose: () => void
    onSaved: () => void
}) {
    const { t } = useMock()
    const a = t.ops.accounts
    const [name, setName] = useState(user.displayName)
    const [err, setErr] = useState<string | null>(null)

    const save = async () => {
        setErr(null)
        try {
            await updateAccount(user.id, { displayName: name.trim() })
            onSaved()
        } catch (e) {
            setErr(errorText(t, e))
        }
    }

    return (
        <Modal title={a.editUser} busy={busy} width={400}
            onClose={onClose}
            footer={<>
                <button className="btn" type="button" onClick={onClose}>{a.cancel}</button>
                <button className="btn pri" type="button" disabled={busy} onClick={() => void save()}>{a.save}</button>
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
