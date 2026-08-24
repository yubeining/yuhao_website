/**
 * 在订单里新建 / 编辑一个零件。**图纸在这里传，挂在这个零件上。**
 *
 * ★ 传图纸会把文件名里的图号和版本填进来（设计文档 9 §3.1 §4.3）——
 *   客户手里是图纸，让他再誊一遍图号是白费力气，还会誊错。
 *   已经填过的值不覆盖：他手填的优先于我方从文件名猜的。
 *
 * ★ 材料没有主数据表（库里只有 spec_template 和 pricing_rule，都不是材料清单）。
 *   运营在「定价参数」页配过才有下拉，一条都没配时是自由输入。
 *   **绝不预置一组编出来的选项** —— 定价公式恰恰按材料算，选项假的价就是假的。
 */

import { useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Field, FieldRow, Input, Select, Stepper } from '../../components/form'
import {
    Banner, Bar, BarLabel, Card, CardBody, CardFoot, CardHead, Fields, Fld,
    Hello, Page, pill,
} from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { addPart, updatePart } from '../../mock/actions'
import { humanSize, parseDrawingName } from '../../mock/drawing'
import { materials } from '../../mock/params'
import { myOrders } from '../../mock/selectors'
import { money, X } from '../../mock/format'
import { num } from '../../mock/params'
import { EXEC_ST } from './status'
import type { RfqFile } from '../../mock/types'

export function PartFormPage() {
    const { state, act } = useMock()
    const navigate = useNavigate()
    const { id, partId } = useParams()
    const order = myOrders(state).find((o) => o.id === id)
    const editing = partId && partId !== 'new' ? order?.parts.find((p) => p.id === partId) : undefined
    const mats = materials(state.rates)
    const input = useRef<HTMLInputElement>(null)

    const [f, setF] = useState({
        no: editing?.no ?? '', name: editing?.name ?? '',
        mat: editing?.mat ?? '', surf: editing?.surf ?? '', qty: String(editing?.qty ?? ''),
        // 客户文件名里的版本字母，只记录不判断
        customerRev: editing?.customerRev ?? '',
    })
    const [files, setFiles] = useState<RfqFile[]>(editing?.files ?? [])
    const [err, setErr] = useState<string | null>(null)

    if (!order) return <Navigate to="/customer/orders" replace />
    if (partId && partId !== 'new' && !editing) return <Navigate to={`/customer/orders/${order.id}`} replace />

    // ★ 只有草稿状态能改。提交之后仍然要能看 —— 规格、附件、生产进度
    //   都在这一页，不给入口等于零件提交完就消失了。
    const readOnly = order.status !== 'draft'

    const set = (k: keyof typeof f) => (v: string) => {
        setF((prev) => ({ ...prev, [k]: v }))
        setErr(null)
    }

    /** 传图纸 → 把文件名里的图号和版本填进空着的字段 */
    const takeFiles = (list: FileList | null) => {
        if (!list?.length) return
        const exist = new Set(files.map((x) => x.name))
        const add = Array.from(list).filter((x) => !exist.has(x.name))
            .map((x) => ({ name: x.name, size: x.size, revFromName: parseDrawingName(x.name).rev }))
        if (!add.length) return
        setFiles((prev) => [...prev, ...add])
        setF((prev) => {
            const next = { ...prev }
            for (const x of add) {
                // 客户自己的版本标记，有就记下来
                if (!next.customerRev.trim() && x.revFromName) next.customerRev = x.revFromName
                if (!next.no.trim()) {
                    const readable = x.name.match(/LB\d+(?:\.\d+)+/)
                    if (readable) next.no = readable[0]
                }
            }
            return next
        })
        setErr(null)
        if (input.current) input.current.value = ''
    }

    const save = () => {
        if (!f.no.trim() || !f.name.trim() || !f.qty.trim()) {
            setErr('图号、名称、数量为必填项')
            return
        }
        const payload = { ...f, files }
        if (editing) act((s) => updatePart(s, order.id, editing.id, payload))
        else act((s) => addPart(s, order.id, payload))
        navigate(`/customer/orders/${order.id}`)
    }

    return (
        <Page>
            <Hello
                back={<Link className="btn sm qui" to={`/customer/orders/${order.id}`}
                    style={{ margin: '0 0 6px -9px' }}>← {order.title}</Link>}
                title={readOnly ? (editing?.name ?? '零件') : editing ? '编辑零件' : '添加零件'}
                sub={editing ? `${editing.no} · 第 ${editing.version} 版` : undefined}
            />

            {readOnly && editing && (
                <>
                    <Card style={{ marginBottom: 16 }}>
                        <CardHead title="零件信息"
                            right={editing.st ? pill(EXEC_ST[editing.st]) : undefined} />
                        <CardBody>
                            <Fields>
                                <Fld k="图号" v={editing.no} mono />
                                <Fld k="名称" v={editing.name} />
                                <Fld k="数量" v={editing.qty} mono />
                                <Fld k="版本" v={`v${editing.version}${editing.customerRev ? ` · ${editing.customerRev}` : ''}`} mono />
                                <Fld k="材料" v={editing.mat || X} />
                                <Fld k="表面处理" v={editing.surf || X} />
                                <Fld k="单价" v={editing.unit !== undefined ? money(editing.unit) : X} mono />
                                <Fld k="小计" v={editing.total !== undefined ? money(editing.total) : X} mono />
                            </Fields>
                            <div className="attach">
                                <div className="attach-hd">
                                    <span className="attach-k">附件</span>
                                    <span className="attach-hint">{editing.files.length} 个</span>
                                </div>
                                {editing.files.length > 0 && (
                                    <div className="fcell" style={{ marginTop: 9 }}>
                                        {editing.files.map((x) => (
                                            <span className="fchip lg" key={x.name} title={x.name}>
                                                <span className="fx">{(x.name.split('.').pop() || '').toUpperCase()}</span>
                                                <b>{x.name}</b><i>{humanSize(x.size)}</i>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </CardBody>
                    </Card>

                    {editing.st && editing.st !== 'waiting' && (
                        <Card>
                            <CardHead title="生产进度" />
                            <CardBody>
                                <BarLabel left={<>已完成 <b>{editing.done ?? 0} / {editing.qty}</b></>} />
                                <Bar pct={Math.round((num(editing.done) / Math.max(1, num(editing.qty))) * 100)} />
                            </CardBody>
                        </Card>
                    )}
                </>
            )}

            {!readOnly && (
            <Card>
                <CardHead title="零件信息" />
                <CardBody>
                    <input ref={input} type="file" multiple hidden onChange={(e) => takeFiles(e.target.files)} />

                    <FieldRow cols={3}>
                        <Field label="图号 *"><Input value={f.no} onChange={set('no')} placeholder="自动识别" /></Field>
                        <Field label="名称 *"><Input value={f.name} onChange={set('name')} /></Field>
                        <Field label="数量 *"><Stepper value={f.qty} onChange={set('qty')} /></Field>
                    </FieldRow>
                    <FieldRow>
                        <Field label="材料">
                            {mats.length
                                ? <Select value={f.mat} options={['', ...mats]} onChange={set('mat')} />
                                : <Input value={f.mat} onChange={set('mat')} placeholder="留空由工程确认" />}
                        </Field>
                        <Field label="表面处理">
                            <Input value={f.surf} onChange={set('surf')} placeholder="留空由工程确认" />
                        </Field>
                    </FieldRow>

                    {/* ★ 附件属于零件，所以放在零件信息里、排在字段后面 ——
                        它是这个零件的补充材料，不是一个独立的东西。 */}
                    <div className="attach">
                        <div className="attach-hd">
                            <span className="attach-k">附件</span>
                            <span className="attach-hint">图纸文件 · STEP / PDF / 原生 CAD</span>
                            <span className="sp" />
                            <button className="btn sm" type="button" onClick={() => input.current?.click()}>
                                ＋ 上传附件
                            </button>
                        </div>
                        {files.length > 0 && (
                            <div className="fcell" style={{ marginTop: 9 }}>
                                {files.map((x) => (
                                    <span className="fchip lg" key={x.name} title={`${x.name} · ${humanSize(x.size)}`}>
                                        <span className="fx">{(x.name.split('.').pop() || '').toUpperCase()}</span>
                                        <b>{x.name}</b><i>{humanSize(x.size)}</i>
                                        <button type="button" className="fdel" title="移除"
                                            onClick={() => setFiles((prev) => prev.filter((y) => y.name !== x.name))}>×</button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ★ 版本是我方记录的事实，不是客户填的字段 —— 他重新传图就是新的一版。 */}
                    {editing && (
                        <div style={{
                            marginTop: 14, paddingTop: 13, borderTop: '1px solid var(--line)',
                            fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.7,
                        }}>
                            第 {editing.version} 版{editing.customerRev && ` · 客户标记 ${editing.customerRev}`}。
                            报价后更换附件将自动升版，需重新报价。
                        </div>
                    )}

                    {err && <Banner tone="wa" style={{ marginTop: 14 }}>{err}</Banner>}
                </CardBody>
                <CardFoot
                    left={<Link className="btn" to={`/customer/orders/${order.id}`}>取消</Link>}
                    right={<button className="btn pri" type="button" onClick={save}>
                        {editing ? '保存' : '加进订单'}
                    </button>}
                />
            </Card>
            )}
        </Page>
    )
}
