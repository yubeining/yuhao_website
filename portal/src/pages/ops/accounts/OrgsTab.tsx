/** 账号管理 · 组织（公司）。新建 / 编辑走居中弹框；客户组织在这里设自己的报价系数。 */

import { useCallback, useState } from 'react'
import { CountrySelect } from '../../../components/CountrySelect'
import { useConfirm } from '../../../components/ConfirmDialog'
import { Modal } from '../../../components/Modal'
import { Field, Input } from '../../../components/form'
import { Banner, Card, CardBody, CardHead, TableWrap } from '../../../components/ui'
import { errorText } from '../../../i18n/errorText'
import { OTHER_COUNTRY, countryName } from '../../../i18n/countries'
import { useMock } from '../../../mock/MockProvider'
import {
    createOrganization, disableOrganization, listOrganizations, updateOrganization, type OrganizationAdminView,
} from '../../../services/ops/accounts'
import {
    clearCustomerMarkup, getCustomerMarkup, setCustomerMarkup, type MarkupView,
} from '../../../services/ops/quotes'
import {
    day, FilterField, ListBanners, ListBody, PAGE_SIZE, ReadOnly, RowActions, StatusPill, usePagedList,
} from './shared'

type OrgForm = { id?: string; type: string; name: string; country: string; markup: string }

export function OrgsTab() {
    const { t, lang } = useMock()
    const [askConfirm, confirmDialog] = useConfirm()
    const a = t.ops.accounts
    const [type, setType] = useState('')
    const fetchOrgs = useCallback((q: string, pageNo: number) => listOrganizations(q, type, pageNo, PAGE_SIZE), [type])
    const list = usePagedList<OrganizationAdminView>(fetchOrgs)
    const [form, setForm] = useState<OrgForm | null>(null)
    const [markupView, setMarkupView] = useState<MarkupView | null>(null)

    const typeLabel = (v: string) =>
        v === 'CUSTOMER' ? a.typeCustomer : v === 'SUPPLIER' ? a.typeSupplier : v === 'INTERNAL' ? a.typeInternal : '—'

    const openNew = () => {
        list.setOk(null)
        list.setErr(null)
        setMarkupView(null)
        setForm({ type: 'CUSTOMER', name: '', country: '', markup: '' })
    }

    /** 打开编辑时读这个客户自己的报价系数（留空 = 用全局默认）。 */
    const openEdit = (row: OrganizationAdminView) => {
        list.setOk(null)
        list.setErr(null)
        setMarkupView(null)
        setForm({ id: row.id, type: row.type, name: row.name, country: row.country ?? '', markup: '' })
        if (row.type === 'CUSTOMER') {
            getCustomerMarkup(row.id)
                .then((view) => {
                    setMarkupView(view)
                    setForm((f) => (f && f.id === row.id
                        ? { ...f, markup: view.markupRate != null ? String(view.markupRate) : '' }
                        : f))
                })
                .catch(() => undefined)
        }
    }

    const save = async () => {
        if (!form || !form.name.trim()) return
        list.setBusy(true)
        try {
            if (form.id) {
                await updateOrganization(form.id, { name: form.name.trim(), country: form.country || null })
                // 报价系数：留空 = 用默认；只在这家是客户、且值真的变了时才写
                if (form.type === 'CUSTOMER') {
                    const raw = form.markup.trim()
                    const current = markupView?.markupRate ?? null
                    if (raw === '') {
                        if (current != null) await clearCustomerMarkup(form.id)
                    } else if (Number(raw) !== current) {
                        await setCustomerMarkup(form.id, Number(raw))
                    }
                }
                list.setOk(a.saved)
            } else {
                await createOrganization({ type: form.type, name: form.name.trim(), country: form.country || null })
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

    const disable = async (row: OrganizationAdminView) => {
        if (!(await askConfirm(a.confirmDisableOrg(row.name), { danger: true }))) return
        await list.act(() => disableOrganization(row.id), a.disabledOk(row.name))
    }
    const enable = (row: OrganizationAdminView) =>
        list.act(() => updateOrganization(row.id, { status: 'ACTIVE' }), a.enabledOk(row.name))

    return (
        <>
            <ListBanners list={list} />

            <Card style={{ marginBottom: 16 }}>
                <CardBody>
                    <div className="fbar">
                        <FilterField label={a.colOrg}>
                            <Input value={list.q} onChange={list.setQ} onEnter={list.search} style={{ width: 220 }} />
                        </FilterField>
                        <FilterField label={a.colType}>
                            <select className="inp" value={type} onChange={(e) => { setType(e.target.value); list.setPage(1) }} style={{ width: 130 }}>
                                <option value="">{a.all}</option>
                                <option value="CUSTOMER">{a.typeCustomer}</option>
                                <option value="SUPPLIER">{a.typeSupplier}</option>
                                <option value="INTERNAL">{a.typeInternal}</option>
                            </select>
                        </FilterField>
                        <button className="btn pri" type="button" disabled={list.busy} onClick={list.search}>{a.query}</button>
                    </div>
                </CardBody>
            </Card>

            <Card>
                <CardHead title={a.tabOrgs} rid={list.rows ? a.orgsTotal(list.total) : undefined}
                    right={<button className="btn sm pri" type="button" onClick={openNew}>{a.create}</button>} />
                <CardBody flush>
                    <ListBody list={list} emptyText={list.applied.q || type ? t.common.noMatch : a.noOrgs}>
                        {(rows) => (
                            <TableWrap>
                                <thead>
                                    <tr>
                                        <th>{a.colOrg}</th><th>{a.colType}</th><th>{a.colCountry}</th>
                                        <th>{a.colStatus}</th><th>{a.colCreated}</th><th />
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((r) => (
                                        <tr key={r.id}>
                                            <td className="t1">{r.name}</td>
                                            <td>{typeLabel(r.type)}</td>
                                            <td>{r.country ? (r.country === OTHER_COUNTRY ? t.reg.otherCountry : countryName(r.country, lang)) : '—'}</td>
                                            <td>
                                                <StatusPill status={r.status}
                                                    label={r.status === 'ACTIVE' ? a.statusActive : a.statusDisabled} />
                                            </td>
                                            <td className="n">{day(r.createdAt)}</td>
                                            <RowActions status={r.status} busy={list.busy}
                                                onEdit={() => openEdit(r)}
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
                <Modal title={form.id ? a.editOrg : a.newOrg} busy={list.busy} width={400}
                    onClose={() => setForm(null)}
                    footer={<>
                        <button className="btn" type="button" onClick={() => setForm(null)}>{a.cancel}</button>
                        <button className="btn pri" type="button" disabled={list.busy || !form.name.trim()}
                            onClick={() => void save()}>{a.save}</button>
                    </>}>
                    {/* 保存失败的提示放在弹框里 —— 页面上那条在遮罩后面，看起来像点了没反应 */}
                    {list.err && <Banner tone="wa" style={{ marginBottom: 12 }}>{list.err}</Banner>}
                    <Field label={a.fldType}>
                        {form.id
                            ? <ReadOnly value={typeLabel(form.type)} note={a.immutableType} />
                            : <select className="inp" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                                <option value="CUSTOMER">{a.typeCustomer}</option>
                                <option value="SUPPLIER">{a.typeSupplier}</option>
                                <option value="INTERNAL">{a.typeInternal}</option>
                            </select>}
                    </Field>
                    <Field label={a.colOrg}>
                        <Input value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
                    </Field>
                    <Field label={a.fldCountry}>
                        <CountrySelect value={form.country} allowOther={false}
                            onChange={(v) => setForm({ ...form, country: v })} />
                    </Field>
                    {form.id && form.type === 'CUSTOMER' && (
                        <Field label={a.fldMarkup}>
                            <Input value={form.markup} onChange={(v) => setForm({ ...form, markup: v })} />
                            <div className="t2" style={{ marginTop: 6 }}>
                                {a.fldMarkupHint} ·
                                {' '}
                                {markupView?.markupRate != null
                                    ? a.markupOwn(markupView.markupRate)
                                    : markupView?.defaultRate != null
                                        ? a.markupDefault(markupView.defaultRate)
                                        : a.markupUnset}
                            </div>
                        </Field>
                    )}
                </Modal>
            )}
            {confirmDialog}
        </>
    )
}
