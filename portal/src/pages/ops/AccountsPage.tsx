/**
 * 账号管理（运营端）。
 *
 * 三块：外部用户（客户 / 供应商联系人）、组织（公司）、运营账号。
 *
 * ★ 「删除」= 禁用（status=DISABLED）。数据不会消失 —— 账号上挂着订单、报价、图纸，
 *   物理删会留下孤儿数据。界面上是「禁用 / 启用」两个按钮，数据上是同一个状态字段。
 * ★ 邮箱与所属公司不可改；组织类型不可改 —— 合同、权限都按这两样判定。
 * ★ 文案全部走 t.ops.accounts（scripts/check-i18n-literals.py 是只减不增的棘轮，
 *   新文件里出现中文字面量会直接让提交闸门失败）。
 */

import { useCallback, useEffect, useState } from 'react'
import { Field, FieldRow, Input } from '../../components/form'
import {
    Banner, Card, CardBody, CardFoot, CardHead, Empty, Hello, Page, Pill, TableWrap,
} from '../../components/ui'
import { errorText } from '../../i18n/errorText'
import { useMock } from '../../mock/MockProvider'
import {
    createAccount, createOrganization, createStaff, disableAccount, disableOrganization, disableStaff,
    listAccounts, listOrganizations, listStaff, updateAccount, updateOrganization, updateStaff,
    type AccountView, type OrganizationAdminView, type StaffView,
} from '../../services/ops/accounts'

type Tab = 'users' | 'orgs' | 'staff'

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '—')

function StatusPill({ status, label }: { status: string; label: string }) {
    return status === 'ACTIVE'
        ? <Pill tone="ok">{label}</Pill>
        : <Pill tone="wa">{label}</Pill>
}

/** 原生 select：value 用 id、显示用名字 —— 共享的 Select 只接受字符串数组，装不下 id。 */
function SelectId({ value, onChange, options, placeholder }: {
    value: string
    onChange: (v: string) => void
    options: { id: string; label: string }[]
    placeholder: string
}) {
    return (
        <select className="inp" value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">{placeholder}</option>
            {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
    )
}

export function OpsAccountsPage() {
    const { t } = useMock()
    const a = t.ops.accounts
    const [tab, setTab] = useState<Tab>('users')
    return (
        <Page>
            <Hello title={a.title} />
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {([['users', a.tabUsers], ['orgs', a.tabOrgs], ['staff', a.tabStaff]] as [Tab, string][])
                    .map(([k, label]) => (
                        <button key={k} type="button" className={`btn sm${tab === k ? ' pri' : ''}`}
                            onClick={() => setTab(k)}>
                            {label}
                        </button>
                    ))}
            </div>
            {tab === 'users' && <UsersTab />}
            {tab === 'orgs' && <OrgsTab />}
            {tab === 'staff' && <StaffTab />}
        </Page>
    )
}

/* ───────────────────────── 外部用户 ───────────────────────── */

function UsersTab() {
    const { t } = useMock()
    const a = t.ops.accounts
    const [rows, setRows] = useState<AccountView[] | null>(null)
    const [total, setTotal] = useState(0)
    const [q, setQ] = useState('')
    const [err, setErr] = useState<string | null>(null)
    const [ok, setOk] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [orgs, setOrgs] = useState<OrganizationAdminView[]>([])
    const [form, setForm] = useState<{
        id?: string; orgId: string; orgName: string; email: string; displayName: string; password: string
    } | null>(null)

    const load = useCallback(async (keyword: string) => {
        try {
            const page = await listAccounts(keyword)
            setRows(page.items)
            setTotal(page.total)
            setErr(null)
        } catch (e) {
            setErr(errorText(t, e))
        }
    }, [t])

    useEffect(() => {
        void load('')
        // 建用户时要选公司，这里先取一次（不含内部组织：外部用户不能挂在 INTERNAL 下）
        listOrganizations('', '', 1, 200)
            .then((p) => setOrgs(p.items.filter((o) => o.type !== 'INTERNAL')))
            .catch(() => undefined)
    }, [load])

    const typeLabel = (type: string | null) => {
        if (type === 'CUSTOMER') return a.typeCustomer
        if (type === 'SUPPLIER') return a.typeSupplier
        if (type === 'INTERNAL') return a.typeInternal
        return '—'
    }

    const save = async () => {
        if (!form) return
        setBusy(true)
        setErr(null)
        try {
            if (form.id) {
                await updateAccount(form.id, { displayName: form.displayName })
                setOk(a.saved)
            } else {
                await createAccount({
                    orgId: form.orgId, email: form.email,
                    displayName: form.displayName, password: form.password,
                })
                setOk(a.created)
            }
            setForm(null)
            await load(q)
        } catch (e) {
            setErr(errorText(t, e))
        } finally {
            setBusy(false)
        }
    }

    const disable = async (row: AccountView) => {
        if (!window.confirm(a.confirmDisableUser(row.email))) return
        setBusy(true)
        try {
            await disableAccount(row.id)
            setOk(a.disabledOk(row.email))
            await load(q)
        } catch (e) {
            setErr(errorText(t, e))
        } finally {
            setBusy(false)
        }
    }

    const enable = async (row: AccountView) => {
        setBusy(true)
        try {
            await updateAccount(row.id, { status: 'ACTIVE' })
            setOk(a.enabledOk(row.email))
            await load(q)
        } catch (e) {
            setErr(errorText(t, e))
        } finally {
            setBusy(false)
        }
    }

    return (
        <>
            {err && <Banner tone="wa" style={{ marginBottom: 14 }}>{err}</Banner>}
            {ok && <Banner tone="in" style={{ marginBottom: 14 }}>{ok}</Banner>}

            <Card style={{ marginBottom: 16 }}>
                <CardHead title={a.search} />
                <CardBody>
                    <FieldRow>
                        <Field label={a.colEmail}>
                            <Input value={q} placeholder={a.searchHint} onChange={setQ} />
                        </Field>
                        <Field label=" ">
                            <button className="btn pri" type="button" disabled={busy}
                                onClick={() => void load(q)}>{a.query}</button>
                        </Field>
                    </FieldRow>
                </CardBody>
            </Card>

            {form && (
                <Card style={{ marginBottom: 16 }}>
                    <CardHead title={form.id ? a.editUser : a.newUser} />
                    <CardBody>
                        <FieldRow>
                            <Field label={a.fldOrg}>
                                {form.id
                                    ? <div style={{ padding: '10px 0' }}>
                                        {form.orgName || '—'}<span className="fnote">{a.immutable}</span>
                                    </div>
                                    : <SelectId value={form.orgId} placeholder={a.selectPlaceholder}
                                        options={orgs.map((o) => ({ id: o.id, label: `${o.name} (${typeLabel(o.type)})` }))}
                                        onChange={(v) => setForm({ ...form, orgId: v })} />}
                            </Field>
                            <Field label={a.fldEmail}>
                                {form.id
                                    ? <div style={{ padding: '10px 0' }}>
                                        {form.email}<span className="fnote">{a.immutable}</span>
                                    </div>
                                    : <Input value={form.email} placeholder="name@company.com"
                                        onChange={(v) => setForm({ ...form, email: v })} />}
                            </Field>
                        </FieldRow>
                        <FieldRow>
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
                        </FieldRow>
                    </CardBody>
                    <CardFoot
                        left={<button className="btn" type="button" onClick={() => setForm(null)}>{a.cancel}</button>}
                        right={<button className="btn pri" type="button" disabled={busy} onClick={() => void save()}>
                            {busy ? '…' : a.save}
                        </button>}
                    />
                </Card>
            )}

            <Card>
                <CardHead title={a.tabUsers} rid={a.usersTotal(total)}
                    right={!form && (
                        <button className="btn sm pri" type="button"
                            onClick={() => { setOk(null); setForm({ orgId: '', orgName: '', email: '', displayName: '', password: '' }) }}>
                            {a.create}
                        </button>
                    )} />
                <CardBody flush>
                    {rows?.length ? (
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>{a.colEmail}</th><th>{a.colName}</th><th>{a.colOrg}</th><th>{a.colType}</th>
                                    <th>{a.colStatus}</th><th>{a.colVerified}</th><th>{a.colCreated}</th><th />
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r) => (
                                    <tr key={r.id}>
                                        <td className="m">{r.email}</td>
                                        <td className="t1">{r.displayName}</td>
                                        <td>{r.orgName ?? '—'}</td>
                                        <td>{typeLabel(r.orgType)}</td>
                                        <td>
                                            <StatusPill status={r.status}
                                                label={r.status === 'ACTIVE' ? a.statusActive : a.statusDisabled} />
                                        </td>
                                        <td>{r.emailVerifiedAt ? day(r.emailVerifiedAt) : a.unverified}</td>
                                        <td className="n">{day(r.createdAt)}</td>
                                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                            <button className="btn sm" type="button"
                                                onClick={() => {
                                                    setOk(null)
                                                    setForm({
                                                        id: r.id, orgId: r.orgId, orgName: r.orgName ?? '',
                                                        email: r.email, displayName: r.displayName, password: '',
                                                    })
                                                }}>
                                                {a.edit}
                                            </button>
                                            {r.status === 'ACTIVE'
                                                ? <button className="btn sm" type="button" disabled={busy}
                                                    onClick={() => void disable(r)}>{a.disable}</button>
                                                : <button className="btn sm" type="button" disabled={busy}
                                                    onClick={() => void enable(r)}>{a.enable}</button>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    ) : <CardBody><Empty text={a.noUsers} sub={a.noUsersSub} /></CardBody>}
                </CardBody>
            </Card>
        </>
    )
}

/* ───────────────────────── 组织 ───────────────────────── */

function OrgsTab() {
    const { t } = useMock()
    const a = t.ops.accounts
    const [rows, setRows] = useState<OrganizationAdminView[] | null>(null)
    const [total, setTotal] = useState(0)
    const [q, setQ] = useState('')
    const [type, setType] = useState('')
    const [err, setErr] = useState<string | null>(null)
    const [ok, setOk] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [form, setForm] = useState<{ id?: string; type: string; name: string; country: string } | null>(null)

    const load = useCallback(async (keyword: string, orgType: string) => {
        try {
            const page = await listOrganizations(keyword, orgType)
            setRows(page.items)
            setTotal(page.total)
            setErr(null)
        } catch (e) {
            setErr(errorText(t, e))
        }
    }, [t])

    useEffect(() => { void load('', '') }, [load])

    const typeLabel = (ty: string) => {
        if (ty === 'CUSTOMER') return a.typeCustomer
        if (ty === 'SUPPLIER') return a.typeSupplier
        if (ty === 'INTERNAL') return a.typeInternal
        return ty
    }

    const save = async () => {
        if (!form) return
        setBusy(true)
        setErr(null)
        try {
            if (form.id) {
                await updateOrganization(form.id, { name: form.name, country: form.country || null })
                setOk(a.saved)
            } else {
                await createOrganization({ type: form.type, name: form.name, country: form.country || null })
                setOk(a.created)
            }
            setForm(null)
            await load(q, type)
        } catch (e) {
            setErr(errorText(t, e))
        } finally {
            setBusy(false)
        }
    }

    const disable = async (row: OrganizationAdminView) => {
        if (!window.confirm(a.confirmDisableOrg(row.name))) return
        setBusy(true)
        try {
            await disableOrganization(row.id)
            setOk(a.disabledOk(row.name))
            await load(q, type)
        } catch (e) {
            setErr(errorText(t, e))
        } finally {
            setBusy(false)
        }
    }

    const enable = async (row: OrganizationAdminView) => {
        setBusy(true)
        try {
            await updateOrganization(row.id, { status: 'ACTIVE' })
            setOk(a.enabledOk(row.name))
            await load(q, type)
        } catch (e) {
            setErr(errorText(t, e))
        } finally {
            setBusy(false)
        }
    }

    return (
        <>
            {err && <Banner tone="wa" style={{ marginBottom: 14 }}>{err}</Banner>}
            {ok && <Banner tone="in" style={{ marginBottom: 14 }}>{ok}</Banner>}

            <Card style={{ marginBottom: 16 }}>
                <CardHead title={a.search} />
                <CardBody>
                    <FieldRow>
                        <Field label={a.colOrg}>
                            <Input value={q} placeholder={a.searchHint} onChange={setQ} />
                        </Field>
                        <Field label={a.colType}>
                            <select className="inp" value={type} onChange={(e) => setType(e.target.value)}>
                                <option value="">{a.all}</option>
                                <option value="CUSTOMER">{a.typeCustomer}</option>
                                <option value="SUPPLIER">{a.typeSupplier}</option>
                                <option value="INTERNAL">{a.typeInternal}</option>
                            </select>
                        </Field>
                    </FieldRow>
                    <button className="btn pri" type="button" style={{ marginTop: 10 }}
                        disabled={busy} onClick={() => void load(q, type)}>{a.query}</button>
                </CardBody>
            </Card>

            {form && (
                <Card style={{ marginBottom: 16 }}>
                    <CardHead title={form.id ? a.editOrg : a.newOrg} />
                    <CardBody>
                        <FieldRow>
                            <Field label={a.fldType}>
                                {form.id
                                    ? <div style={{ padding: '10px 0' }}>
                                        {typeLabel(form.type)}<span className="fnote">{a.immutableType}</span>
                                    </div>
                                    : <select className="inp" value={form.type}
                                        onChange={(e) => setForm({ ...form, type: e.target.value })}>
                                        <option value="CUSTOMER">{a.typeCustomer}</option>
                                        <option value="SUPPLIER">{a.typeSupplier}</option>
                                        <option value="INTERNAL">{a.typeInternal}</option>
                                    </select>}
                            </Field>
                            <Field label={a.colOrg}>
                                <Input value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
                            </Field>
                        </FieldRow>
                        <FieldRow>
                            <Field label={a.fldCountry}>
                                <Input value={form.country} placeholder="DE"
                                    onChange={(v) => setForm({ ...form, country: v })} />
                            </Field>
                        </FieldRow>
                    </CardBody>
                    <CardFoot
                        left={<button className="btn" type="button" onClick={() => setForm(null)}>{a.cancel}</button>}
                        right={<button className="btn pri" type="button" disabled={busy} onClick={() => void save()}>
                            {busy ? '…' : a.save}
                        </button>}
                    />
                </Card>
            )}

            <Card>
                <CardHead title={a.tabOrgs} rid={a.orgsTotal(total)}
                    right={!form && (
                        <button className="btn sm pri" type="button"
                            onClick={() => { setOk(null); setForm({ type: 'CUSTOMER', name: '', country: '' }) }}>
                            {a.create}
                        </button>
                    )} />
                <CardBody flush>
                    {rows?.length ? (
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
                                        <td>{r.country ?? '—'}</td>
                                        <td>
                                            <StatusPill status={r.status}
                                                label={r.status === 'ACTIVE' ? a.statusActive : a.statusDisabled} />
                                        </td>
                                        <td className="n">{day(r.createdAt)}</td>
                                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                            <button className="btn sm" type="button"
                                                onClick={() => {
                                                    setOk(null)
                                                    setForm({ id: r.id, type: r.type, name: r.name, country: r.country ?? '' })
                                                }}>
                                                {a.edit}
                                            </button>
                                            {r.status === 'ACTIVE'
                                                ? <button className="btn sm" type="button" disabled={busy}
                                                    onClick={() => void disable(r)}>{a.disable}</button>
                                                : <button className="btn sm" type="button" disabled={busy}
                                                    onClick={() => void enable(r)}>{a.enable}</button>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    ) : <CardBody><Empty text={a.noOrgs} /></CardBody>}
                </CardBody>
            </Card>
        </>
    )
}

/* ───────────────────────── 运营账号 ───────────────────────── */

function StaffTab() {
    const { t } = useMock()
    const a = t.ops.accounts
    const [rows, setRows] = useState<StaffView[] | null>(null)
    const [total, setTotal] = useState(0)
    const [q, setQ] = useState('')
    const [err, setErr] = useState<string | null>(null)
    const [ok, setOk] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [internalOrgs, setInternalOrgs] = useState<OrganizationAdminView[]>([])
    const [form, setForm] = useState<{
        id?: string; orgId: string; orgName: string; email: string; displayName: string; password: string
    } | null>(null)

    const load = useCallback(async (keyword: string) => {
        try {
            const page = await listStaff(keyword)
            setRows(page.items)
            setTotal(page.total)
            setErr(null)
        } catch (e) {
            setErr(errorText(t, e))
        }
    }, [t])

    useEffect(() => {
        void load('')
        listOrganizations('', 'INTERNAL', 1, 100)
            .then((p) => setInternalOrgs(p.items))
            .catch(() => undefined)
    }, [load])

    const save = async () => {
        if (!form) return
        setBusy(true)
        setErr(null)
        try {
            if (form.id) {
                await updateStaff(form.id, { displayName: form.displayName })
                setOk(a.saved)
            } else {
                await createStaff({
                    orgId: form.orgId, email: form.email,
                    displayName: form.displayName, password: form.password,
                })
                setOk(a.created)
            }
            setForm(null)
            await load(q)
        } catch (e) {
            setErr(errorText(t, e))
        } finally {
            setBusy(false)
        }
    }

    const disable = async (row: StaffView) => {
        if (!window.confirm(a.confirmDisableStaff(row.email))) return
        setBusy(true)
        try {
            await disableStaff(row.id)
            setOk(a.disabledOk(row.email))
            await load(q)
        } catch (e) {
            setErr(errorText(t, e))
        } finally {
            setBusy(false)
        }
    }

    const enable = async (row: StaffView) => {
        setBusy(true)
        try {
            await updateStaff(row.id, { status: 'ACTIVE' })
            setOk(a.enabledOk(row.email))
            await load(q)
        } catch (e) {
            setErr(errorText(t, e))
        } finally {
            setBusy(false)
        }
    }

    return (
        <>
            {err && <Banner tone="wa" style={{ marginBottom: 14 }}>{err}</Banner>}
            {ok && <Banner tone="in" style={{ marginBottom: 14 }}>{ok}</Banner>}
            <Banner tone="wa" style={{ marginBottom: 14 }}>{a.staffOrgHint}</Banner>

            <Card style={{ marginBottom: 16 }}>
                <CardHead title={a.search} />
                <CardBody>
                    <FieldRow>
                        <Field label={a.colEmail}>
                            <Input value={q} placeholder={a.searchHint} onChange={setQ} />
                        </Field>
                        <Field label=" ">
                            <button className="btn pri" type="button" disabled={busy}
                                onClick={() => void load(q)}>{a.query}</button>
                        </Field>
                    </FieldRow>
                </CardBody>
            </Card>

            {form && (
                <Card style={{ marginBottom: 16 }}>
                    <CardHead title={form.id ? a.editStaff : a.newStaff} />
                    <CardBody>
                        <FieldRow>
                            <Field label={a.colDept}>
                                {form.id
                                    ? <div style={{ padding: '10px 0' }}>{form.orgName || '—'}</div>
                                    : <SelectId value={form.orgId} placeholder={a.selectPlaceholder}
                                        options={internalOrgs.map((o) => ({ id: o.id, label: o.name }))}
                                        onChange={(v) => setForm({ ...form, orgId: v })} />}
                            </Field>
                            <Field label={a.fldEmail}>
                                {form.id
                                    ? <div style={{ padding: '10px 0' }}>
                                        {form.email}<span className="fnote">{a.immutable}</span>
                                    </div>
                                    : <Input value={form.email} placeholder="name@company.com"
                                        onChange={(v) => setForm({ ...form, email: v })} />}
                            </Field>
                        </FieldRow>
                        <FieldRow>
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
                        </FieldRow>
                    </CardBody>
                    <CardFoot
                        left={<button className="btn" type="button" onClick={() => setForm(null)}>{a.cancel}</button>}
                        right={<button className="btn pri" type="button" disabled={busy} onClick={() => void save()}>
                            {busy ? '…' : a.save}
                        </button>}
                    />
                </Card>
            )}

            <Card>
                <CardHead title={a.tabStaff} rid={a.staffTotal(total)}
                    right={!form && (
                        <button className="btn sm pri" type="button"
                            onClick={() => {
                                setOk(null)
                                setForm({ orgId: '', orgName: '', email: '', displayName: '', password: '' })
                            }}>
                            {a.create}
                        </button>
                    )} />
                <CardBody flush>
                    {rows?.length ? (
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
                                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                            <button className="btn sm" type="button"
                                                onClick={() => {
                                                    setOk(null)
                                                    setForm({
                                                        id: r.id, orgId: r.orgId, orgName: r.orgName ?? '',
                                                        email: r.email, displayName: r.displayName, password: '',
                                                    })
                                                }}>
                                                {a.edit}
                                            </button>
                                            {r.status === 'ACTIVE'
                                                ? <button className="btn sm" type="button" disabled={busy}
                                                    onClick={() => void disable(r)}>{a.disable}</button>
                                                : <button className="btn sm" type="button" disabled={busy}
                                                    onClick={() => void enable(r)}>{a.enable}</button>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    ) : <CardBody><Empty text={a.noStaff} /></CardBody>}
                </CardBody>
            </Card>
        </>
    )
}
