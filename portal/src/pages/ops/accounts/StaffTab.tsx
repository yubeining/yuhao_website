/** 账号管理 · 运营账号（内部员工）。新建时选内部组织、设初始密码；编辑只改姓名。 */

import { useEffect, useState } from 'react'
import { useConfirm } from '../../../components/ConfirmDialog'
import { Modal } from '../../../components/Modal'
import { Field, Input } from '../../../components/form'
import { Banner, Card, CardBody, CardHead, TableWrap } from '../../../components/ui'
import { errorText } from '../../../i18n/errorText'
import { useMock } from '../../../mock/MockProvider'
import {
    createStaff, disableStaff, listOrganizations, listStaff, updateStaff,
    type OrganizationAdminView, type StaffView,
} from '../../../services/ops/accounts'
import {
    day, FilterField, ListBanners, ListBody, PAGE_SIZE, ReadOnly, RowActions, SelectId, StatusPill, usePagedList,
} from './shared'

type StaffForm = { id?: string; orgId: string; orgName: string; email: string; displayName: string; password: string }

const fetchStaff = (q: string, pageNo: number) => listStaff(q, pageNo, PAGE_SIZE)

export function StaffTab() {
    const { t } = useMock()
    const [askConfirm, confirmDialog] = useConfirm()
    const a = t.ops.accounts
    const list = usePagedList<StaffView>(fetchStaff)
    const [orgs, setOrgs] = useState<OrganizationAdminView[]>([])
    const [form, setForm] = useState<StaffForm | null>(null)

    useEffect(() => {
        // 建运营账号时选内部组织
        listOrganizations('', 'INTERNAL', 1, 200)
            .then((p) => setOrgs(p.items))
            .catch(() => undefined)
    }, [])

    const open = (f: StaffForm) => {
        list.setOk(null)
        list.setErr(null)
        setForm(f)
    }

    const save = async () => {
        if (!form) return
        list.setBusy(true)
        try {
            if (form.id) {
                await updateStaff(form.id, { displayName: form.displayName.trim() })
                list.setOk(a.saved)
            } else {
                await createStaff({ orgId: form.orgId, email: form.email.trim(), displayName: form.displayName.trim(), password: form.password })
                list.setOk(a.created)
            }
            setForm(null)
            await list.load(list.page)
        } catch (e) {
            list.setErr(errorText(t, e))
        } finally {
            list.setBusy(false)
        }
    }

    const disable = async (row: StaffView) => {
        if (!(await askConfirm(a.confirmDisableStaff(row.email), { danger: true }))) return
        await list.act(() => disableStaff(row.id), a.disabledOk(row.email))
    }
    const enable = (row: StaffView) => list.act(() => updateStaff(row.id, { status: 'ACTIVE' }), a.enabledOk(row.email))

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
                <CardHead title={a.tabStaff} rid={list.rows ? a.staffTotal(list.total) : undefined}
                    right={
                        <button className="btn sm pri" type="button"
                            onClick={() => open({ orgId: '', orgName: '', email: '', displayName: '', password: '' })}>
                            {a.create}
                        </button>
                    } />
                <CardBody flush>
                    <ListBody list={list} emptyText={list.applied.q ? t.common.noMatch : a.noStaff}>
                        {(rows) => (
                            <TableWrap>
                                <thead>
                                    <tr>
                                        <th>{a.colEmail}</th><th>{a.colName}</th><th>{a.colDept}</th>
                                        <th>{a.colStatus}</th><th>{a.colCreated}</th><th />
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
                                            <td className="n">{day(r.createdAt)}</td>
                                            <RowActions status={r.status} busy={list.busy}
                                                onEdit={() => open({ id: r.id, orgId: r.orgId, orgName: r.orgName ?? '', email: r.email, displayName: r.displayName, password: '' })}
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

            {form && (
                <Modal title={form.id ? a.editStaff : a.newStaff} busy={list.busy} width={400}
                    onClose={() => setForm(null)}
                    footer={<>
                        <button className="btn" type="button" onClick={() => setForm(null)}>{a.cancel}</button>
                        <button className="btn pri" type="button" disabled={list.busy}
                            onClick={() => void save()}>{a.save}</button>
                    </>}>
                    {/* 保存失败的提示放在弹框里 —— 页面上那条在遮罩后面，看起来像点了没反应 */}
                    {list.err && <Banner tone="wa" style={{ marginBottom: 12 }}>{list.err}</Banner>}
                    <Field label={a.fldOrg}>
                        {form.id
                            ? <ReadOnly value={form.orgName || '—'} note={a.immutable} />
                            : <SelectId value={form.orgId} placeholder={a.selectPlaceholder}
                                options={orgs.map((o) => ({ id: o.id, label: o.name }))}
                                onChange={(v) => setForm({ ...form, orgId: v })} />}
                    </Field>
                    <Field label={a.fldEmail}>
                        {form.id
                            ? <ReadOnly value={form.email} note={a.immutable} />
                            : <Input value={form.email}
                                onChange={(v) => setForm({ ...form, email: v })} />}
                    </Field>
                    <Field label={a.fldName}>
                        <Input value={form.displayName}
                            onChange={(v) => setForm({ ...form, displayName: v })} />
                    </Field>
                    {!form.id && (
                        <Field label={a.fldPassword}>
                            <Input type="password" value={form.password}
                                onChange={(v) => setForm({ ...form, password: v })} />
                        </Field>
                    )}
                </Modal>
            )}
            {confirmDialog}
        </>
    )
}
