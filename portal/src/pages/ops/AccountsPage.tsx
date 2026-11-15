/**
 * 账号管理（运营端）。
 *
 * 三块：外部用户（客户 / 供应商联系人）、组织（公司）、运营账号。
 *
 * ★ 「删除」= 禁用（status=DISABLED）。数据不会消失 —— 账号上挂着订单、报价、图纸，
 *   物理删会留下孤儿数据。界面上是「禁用 / 启用」两个按钮，数据上是同一个状态字段。
 * ★ 邮箱与所属公司不可改；组织类型不可改 —— 合同、权限都按这两样判定。
 *
 * ★ 2026-11-15 改：
 *   - 新建 / 编辑改成右侧抽屉，不再插进列表中间把页面挤乱；
 *   - 不再「代建外部用户」—— 客户/供应商都自助注册，运营只改姓名、禁用/启用；
 *   - 三个子页都接统一分页（每页 20 条），搜索栏对齐、回车可查。
 * ★ 文案全部走 t.ops.accounts（scripts/check-i18n-literals.py 是只减不增的棘轮）。
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { CountrySelect } from '../../components/CountrySelect'
import { Drawer } from '../../components/Drawer'
import { Pagination } from '../../components/Pagination'
import { Field, Input } from '../../components/form'
import {
    Banner, Card, CardBody, CardHead, Empty, Hello, Page, Pill, TableWrap,
} from '../../components/ui'
import { errorText } from '../../i18n/errorText'
import { OTHER_COUNTRY, countryName } from '../../i18n/countries'
import { useMock } from '../../mock/MockProvider'
import {
    createOrganization, createStaff, disableAccount, disableOrganization, disableStaff,
    listAccounts, listOrganizations, listStaff, updateAccount, updateOrganization, updateStaff,
    type AccountView, type OrganizationAdminView, type StaffView,
} from '../../services/ops/accounts'

type Tab = 'users' | 'orgs' | 'staff'

const PAGE_SIZE = 20

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

/** 搜索栏里的一格：标签在输入框上方，和「查询」按钮同一行底部对齐。 */
function FilterField({ label, children }: { label: string; children: ReactNode }) {
    return <div className="ff"><span className="ff-k">{label}</span>{children}</div>
}

export function OpsAccountsPage() {
    const { t } = useMock()
    const a = t.ops.accounts
    // tab 来自 URL：/ops/accounts/users|orgs|staff —— 可收藏、可分享、刷新不丢
    const { pathname } = useLocation()
    const tab: Tab = pathname.endsWith('/orgs') ? 'orgs' : pathname.endsWith('/staff') ? 'staff' : 'users'
    return (
        <Page>
            <Hello title={a.title} />
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
    const [page, setPage] = useState(1)
    const [q, setQ] = useState('')
    const [err, setErr] = useState<string | null>(null)
    const [ok, setOk] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [editing, setEditing] = useState<AccountView | null>(null)

    const load = useCallback(async (pageNo: number) => {
        try {
            const pg = await listAccounts(q, pageNo, PAGE_SIZE)
            setRows(pg.items)
            setTotal(pg.total)
            setErr(null)
        } catch (e) {
            setErr(errorText(t, e))
        }
    }, [q, t])

    useEffect(() => { void load(page) }, [load, page])

    const search = () => { setPage(1); void load(1) }

    const disable = async (row: AccountView) => {
        if (!window.confirm(a.confirmDisableUser(row.email))) return
        setBusy(true)
        try {
            await disableAccount(row.id)
            setOk(a.disabledOk(row.email))
            await load(page)
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
            await load(page)
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
                <CardBody>
                    <div className="fbar">
                        <FilterField label={a.colEmail}>
                            <Input value={q} placeholder={a.searchHint} onChange={setQ} onEnter={search} style={{ width: 260 }} />
                        </FilterField>
                        <button className="btn pri" type="button" disabled={busy} onClick={search}>{a.query}</button>
                    </div>
                </CardBody>
            </Card>

            <Card>
                <CardHead title={a.tabUsers} rid={a.usersTotal(total)} />
                <CardBody flush>
                    {rows?.length ? (
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
                                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                            <button className="btn sm" type="button"
                                                onClick={() => { setOk(null); setEditing(r) }}>
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
                    ) : (
                        <Empty text={a.noUsers} />
                    )}
                    <Pagination page={page} pageSize={PAGE_SIZE} total={total}
                        onChange={(p) => { setPage(p); void load(p) }} />
                </CardBody>
            </Card>

            {editing && (
                <UserDrawer user={editing} busy={busy}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); void load(page) }} />
            )}
        </>
    )
}

/** 编辑外部用户：只有姓名可改，邮箱 / 公司只读。 */
function UserDrawer({ user, busy, onClose, onSaved }: {
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
        <Drawer title={a.editUser} busy={busy}
            onClose={onClose}
            footer={<>
                <button className="btn" type="button" onClick={onClose}>{a.cancel}</button>
                <button className="btn pri" type="button" disabled={busy} onClick={() => void save()}>{a.save}</button>
            </>}>
            <Field label={a.colEmail}>
                <div style={{ padding: '9px 0' }}>{user.email}<span className="fnote">{a.immutable}</span></div>
            </Field>
            <Field label={a.colOrg}>
                <div style={{ padding: '9px 0' }}>{user.orgName ?? '—'}<span className="fnote">{a.immutable}</span></div>
            </Field>
            <Field label={a.fldName}>
                <Input value={name} onChange={setName} />
            </Field>
            {err && <Banner tone="wa" style={{ marginTop: 12 }}>{err}</Banner>}
        </Drawer>
    )
}

/* ───────────────────────── 组织 ───────────────────────── */

function OrgsTab() {
    const { t, lang } = useMock()
    const a = t.ops.accounts
    const [rows, setRows] = useState<OrganizationAdminView[] | null>(null)
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [q, setQ] = useState('')
    const [type, setType] = useState('')
    const [err, setErr] = useState<string | null>(null)
    const [ok, setOk] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [form, setForm] = useState<{ id?: string; type: string; name: string; country: string } | null>(null)

    const load = useCallback(async (pageNo: number) => {
        try {
            const pg = await listOrganizations(q, type, pageNo, PAGE_SIZE)
            setRows(pg.items)
            setTotal(pg.total)
            setErr(null)
        } catch (e) {
            setErr(errorText(t, e))
        }
    }, [q, type, t])

    useEffect(() => { void load(page) }, [load, page])

    const search = () => { setPage(1); void load(1) }

    const typeLabel = (v: string) =>
        v === 'CUSTOMER' ? a.typeCustomer : v === 'SUPPLIER' ? a.typeSupplier : v === 'INTERNAL' ? a.typeInternal : '—'

    const save = async () => {
        if (!form || !form.name.trim()) return
        setBusy(true)
        try {
            if (form.id) {
                await updateOrganization(form.id, { name: form.name.trim(), country: form.country || null })
                setOk(a.saved)
            } else {
                await createOrganization({ type: form.type, name: form.name.trim(), country: form.country || null })
                setOk(a.created)
            }
            setForm(null)
            await load(page)
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
            await load(page)
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
            await load(page)
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
                <CardBody>
                    <div className="fbar">
                        <FilterField label={a.colOrg}>
                            <Input value={q} placeholder={a.searchHint} onChange={setQ} onEnter={search} style={{ width: 220 }} />
                        </FilterField>
                        <FilterField label={a.colType}>
                            <select className="inp" value={type} onChange={(e) => setType(e.target.value)} style={{ width: 130 }}>
                                <option value="">{a.all}</option>
                                <option value="CUSTOMER">{a.typeCustomer}</option>
                                <option value="SUPPLIER">{a.typeSupplier}</option>
                                <option value="INTERNAL">{a.typeInternal}</option>
                            </select>
                        </FilterField>
                        <button className="btn pri" type="button" disabled={busy} onClick={search}>{a.query}</button>
                    </div>
                </CardBody>
            </Card>

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
                                        <td>{r.country ? (r.country === OTHER_COUNTRY ? t.reg.otherCountry : countryName(r.country, lang)) : '—'}</td>
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
                    ) : (
                        <Empty text={a.noOrgs} />
                    )}
                    <Pagination page={page} pageSize={PAGE_SIZE} total={total}
                        onChange={(p) => { setPage(p); void load(p) }} />
                </CardBody>
            </Card>

            {form && (
                <Drawer title={form.id ? a.editOrg : a.newOrg} busy={busy}
                    onClose={() => setForm(null)}
                    footer={<>
                        <button className="btn" type="button" onClick={() => setForm(null)}>{a.cancel}</button>
                        <button className="btn pri" type="button" disabled={busy || !form.name.trim()}
                            onClick={() => void save()}>{a.save}</button>
                    </>}>
                    <Field label={a.fldType}>
                        {form.id
                            ? <div style={{ padding: '9px 0' }}>{typeLabel(form.type)}<span className="fnote">{a.immutableType}</span></div>
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
                </Drawer>
            )}
        </>
    )
}

/* ───────────────────────── 运营账号 ───────────────────────── */

function StaffTab() {
    const { t } = useMock()
    const a = t.ops.accounts
    const [rows, setRows] = useState<StaffView[] | null>(null)
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [q, setQ] = useState('')
    const [err, setErr] = useState<string | null>(null)
    const [ok, setOk] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [orgs, setOrgs] = useState<OrganizationAdminView[]>([])
    const [form, setForm] = useState<{ id?: string; orgId: string; orgName: string; email: string; displayName: string; password: string } | null>(null)

    const load = useCallback(async (pageNo: number) => {
        try {
            const pg = await listStaff(q, pageNo, PAGE_SIZE)
            setRows(pg.items)
            setTotal(pg.total)
            setErr(null)
        } catch (e) {
            setErr(errorText(t, e))
        }
    }, [q, t])

    useEffect(() => { void load(page) }, [load, page])

    useEffect(() => {
        // 建运营账号时选内部组织
        listOrganizations('', 'INTERNAL', 1, 200)
            .then((p) => setOrgs(p.items))
            .catch(() => undefined)
    }, [])

    const search = () => { setPage(1); void load(1) }

    const save = async () => {
        if (!form) return
        setBusy(true)
        try {
            if (form.id) {
                await updateStaff(form.id, { displayName: form.displayName.trim() })
                setOk(a.saved)
            } else {
                await createStaff({ orgId: form.orgId, email: form.email.trim(), displayName: form.displayName.trim(), password: form.password })
                setOk(a.created)
            }
            setForm(null)
            await load(page)
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
            await load(page)
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
            await load(page)
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
                <CardBody>
                    <div className="fbar">
                        <FilterField label={a.colEmail}>
                            <Input value={q} placeholder={a.searchHint} onChange={setQ} onEnter={search} style={{ width: 260 }} />
                        </FilterField>
                        <button className="btn pri" type="button" disabled={busy} onClick={search}>{a.query}</button>
                    </div>
                </CardBody>
            </Card>

            <Card>
                <CardHead title={a.tabStaff} rid={a.staffTotal(total)}
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
                                                    setForm({ id: r.id, orgId: r.orgId, orgName: r.orgName ?? '', email: r.email, displayName: r.displayName, password: '' })
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
                    ) : (
                        <Empty text={a.noStaff} />
                    )}
                    <Pagination page={page} pageSize={PAGE_SIZE} total={total}
                        onChange={(p) => { setPage(p); void load(p) }} />
                </CardBody>
            </Card>

            {form && (
                <Drawer title={form.id ? a.editStaff : a.newStaff} busy={busy}
                    onClose={() => setForm(null)}
                    footer={<>
                        <button className="btn" type="button" onClick={() => setForm(null)}>{a.cancel}</button>
                        <button className="btn pri" type="button" disabled={busy}
                            onClick={() => void save()}>{a.save}</button>
                    </>}>
                    <Field label={a.fldOrg}>
                        {form.id
                            ? <div style={{ padding: '9px 0' }}>{form.orgName || '—'}<span className="fnote">{a.immutable}</span></div>
                            : <SelectId value={form.orgId} placeholder={a.selectPlaceholder}
                                options={orgs.map((o) => ({ id: o.id, label: o.name }))}
                                onChange={(v) => setForm({ ...form, orgId: v })} />}
                    </Field>
                    <Field label={a.fldEmail}>
                        {form.id
                            ? <div style={{ padding: '9px 0' }}>{form.email}<span className="fnote">{a.immutable}</span></div>
                            : <Input value={form.email} placeholder="name@company.com"
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
                </Drawer>
            )}
        </>
    )
}
