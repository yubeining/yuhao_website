/**
 * 供应商入驻向导：企业信息 → 设备清单 → 资质与账号。
 *
 * ★ 三步在一个组件里、表单值提在最外层 —— 上一步 / 下一步来回切时值不能丢。
 *   拆成三个路由的话要把草稿存到别处，为一个一次性流程不值得。
 *
 * ★ 提交后企业是 review 状态，不是 active：能登录、能逛大厅，但抢不了单。
 *   这条规则在 actions.onboard 里，不在这儿。
 */

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
    Checkbox, ErrMsg, Field, FieldRow, Input, Select, UploadDrop,
} from '../../components/form'
import { Card, CardBody, CardFoot, CardHead, SectionTitle, StepBar, TableWrap } from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { findUserByMail, onboard } from '../../mock/actions'
import type { Machine } from '../../mock/types'
import { OnboardShell } from './OnboardShell'

const STEPS = ['企业信息', '设备清单', '资质与账号']
const MACHINE_TYPES = ['设备类型 1', '设备类型 2', '设备类型 3', '设备类型 4', '设备类型 5']
const emptyMachine = (): Machine => ({ type: MACHINE_TYPES[0], qty: '', size: '', prec: '' })

const DOCS: [string, string][] = [
    ['营业执照', '必传 · 加盖公章'],
    ['体系认证', '体系认证证书，有则传'],
    ['检测设备证书', '校准证书，有则传'],
    ['过往案例', '非必需，加分项'],
]

export function SupplierRegisterPage() {
    const { state, act } = useMock()
    const navigate = useNavigate()
    const p = state.params
    const [step, setStep] = useState(0)
    const [err, setErr] = useState<string | null>(null)

    const [f, setF] = useState({
        name: '', code: '', addr: '', factory: '', contact: '', phone: '',
        invTitle: '', taxNo: '', bank: '', acct: '',
        cmm: '有', report: '可以', mail: '', pw: '',
    })
    const set = (k: keyof typeof f) => (v: string) => {
        setF((prev) => ({ ...prev, [k]: v }))
        setErr(null)
    }

    const [machines, setMachines] = useState<Machine[]>([emptyMachine()])
    const [agree, setAgree] = useState(false)

    const setMachine = (i: number, k: keyof Machine, v: string) =>
        setMachines((prev) => prev.map((m, j) => (j === i ? { ...m, [k]: v } : m)))

    const submit = () => {
        if (!f.name || !f.mail || !f.pw) return setErr('请填写企业名称、登录邮箱和密码')
        if (findUserByMail(state, f.mail)) return setErr('这个邮箱已经注册过了')
        if (!agree) return setErr('请先同意框架协议')
        act((s) => onboard(s, { ...f, machines }))
        navigate('/auth/supplier-done')
    }

    const TERMS: [string, string][] = [
        ['付款', `融一智造收到终端客户对应货款后 ${p.payDays} 个工作日内支付；客户未付款的，付款期相应顺延`],
        ['交付', '以每单派单包约定的交期为准，EXW 指定仓库'],
        ['质量', '按派单包锚定的图纸版本执行，不合格批次由乙方承担返工与运费'],
        ['保密', '不得向第三方披露图纸、终端客户身份与价格信息'],
        ['发票', `交付后 ${p.invDays} 日内开具增值税专用发票并上传平台`],
    ]

    return (
        <OnboardShell right={<Link className="btn sm qui" to="/auth/signin">稍后再填</Link>}>
            <StepBar names={STEPS} cur={step} />

            {step === 0 && (
                <Card>
                    <CardHead title="企业信息" />
                    <CardBody>
                        <FieldRow>
                            <Field label="企业名称"><Input value={f.name} onChange={set('name')} placeholder="营业执照上的全称" /></Field>
                            <Field label="统一社会信用代码"><Input value={f.code} onChange={set('code')} placeholder="18 位" /></Field>
                        </FieldRow>
                        <FieldRow>
                            <Field label="注册地址"><Input value={f.addr} onChange={set('addr')} placeholder="省 / 市 / 区 / 详细地址" /></Field>
                            <Field label="工厂地址"><Input value={f.factory} onChange={set('factory')} placeholder="与注册地址不同时填写" /></Field>
                        </FieldRow>
                        <FieldRow>
                            <Field label="联系人"><Input value={f.contact} onChange={set('contact')} placeholder="姓名" /></Field>
                            <Field label="手机"><Input value={f.phone} onChange={set('phone')} placeholder="接收派单通知" /></Field>
                        </FieldRow>

                        <SectionTitle style={{ marginTop: 20 }}>开票与收款</SectionTitle>
                        <FieldRow>
                            <Field label="发票抬头"><Input value={f.invTitle} onChange={set('invTitle')} placeholder="与企业名称一致" /></Field>
                            <Field label="纳税人识别号"><Input value={f.taxNo} onChange={set('taxNo')} placeholder="开专票用" /></Field>
                        </FieldRow>
                        <FieldRow>
                            <Field label="开户银行"><Input value={f.bank} onChange={set('bank')} placeholder="支行全称" /></Field>
                            <Field label="银行账号"><Input value={f.acct} onChange={set('acct')} placeholder="对公账户" /></Field>
                        </FieldRow>
                    </CardBody>
                    <CardFoot right={
                        <button className="btn pri" type="button" onClick={() => setStep(1)}>下一步：设备清单 →</button>
                    } />
                </Card>
            )}

            {step === 1 && (
                <Card>
                    <CardHead title="设备清单" />
                    <CardBody>
                        <div className="mchd">
                            <span>设备类型</span><span>数量</span>
                            <span>最大加工尺寸</span><span>加工精度</span><span />
                        </div>
                        {machines.map((m, i) => (
                            <div className="mcrow" key={i}>
                                <Select value={m.type} options={MACHINE_TYPES} onChange={(v) => setMachine(i, 'type', v)} />
                                <Input value={m.qty} placeholder="台" onChange={(v) => setMachine(i, 'qty', v)} />
                                <Input value={m.size} placeholder="——" onChange={(v) => setMachine(i, 'size', v)} />
                                <Input value={m.prec} placeholder="——" onChange={(v) => setMachine(i, 'prec', v)} />
                                <button className="del" type="button" title="删除这一行"
                                    onClick={() => setMachines((prev) =>
                                        prev.length > 1 ? prev.filter((_, j) => j !== i) : prev)}>
                                    ×
                                </button>
                            </div>
                        ))}
                        <button className="btn sm" type="button" style={{ marginTop: 6 }}
                            onClick={() => setMachines((prev) => [...prev, emptyMachine()])}>
                            ＋ 添加设备
                        </button>

                        <SectionTitle style={{ marginTop: 22 }}>检测能力</SectionTitle>
                        <FieldRow>
                            <Field label="三坐标 / 影像仪">
                                <Select value={f.cmm} options={['有', '无', '外协']} onChange={set('cmm')} />
                            </Field>
                            <Field label="可出具检测报告">
                                <Select value={f.report} options={['可以', '不可以']} onChange={set('report')} />
                            </Field>
                        </FieldRow>
                    </CardBody>
                    <CardFoot
                        left={<button className="btn" type="button" onClick={() => setStep(0)}>← 上一步</button>}
                        right={<button className="btn pri" type="button" onClick={() => setStep(2)}>下一步：资质与账号 →</button>}
                    />
                </Card>
            )}

            {step === 2 && (
                <>
                    <Card>
                        <CardHead title="资质证明" />
                        <CardBody>
                            <div className="cols" style={{ gridTemplateColumns: '1fr 1fr' }}>
                                {DOCS.map(([a, b]) => <UploadDrop key={a} title={a} hint={b} />)}
                            </div>
                        </CardBody>
                    </Card>

                    <Card style={{ marginTop: 16 }}>
                        <CardHead title="登录账号" />
                        <CardBody>
                            <FieldRow>
                                <Field label="登录邮箱">
                                    <Input type="email" value={f.mail} onChange={set('mail')} placeholder="用于登录平台" />
                                </Field>
                                <Field label="设置密码">
                                    <Input type="password" value={f.pw} onChange={set('pw')} placeholder="至少 6 位" />
                                </Field>
                            </FieldRow>
                        </CardBody>
                    </Card>

                    <Card style={{ marginTop: 16 }}>
                        <CardHead title="供应商框架协议" />
                        <CardBody>
                            <TableWrap>
                                <tbody>
                                    {TERMS.map(([k, v]) => (
                                        <tr key={k}>
                                            <td style={{ width: 70, verticalAlign: 'top' }}>
                                                <span style={{
                                                    fontSize: 11, fontWeight: 700, letterSpacing: '.06em',
                                                    color: 'var(--faint)', textTransform: 'uppercase',
                                                }}>{k}</span>
                                            </td>
                                            <td style={{ lineHeight: 1.65 }}>{v}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </TableWrap>
                            <ErrMsg>{err}</ErrMsg>
                            <div className="inprow" style={{ marginTop: 14 }}>
                                <Checkbox checked={agree} onChange={(v) => { setAgree(v); setErr(null) }}>
                                    我已阅读并同意《供应商框架协议》与《保密协议》
                                </Checkbox>
                            </div>
                        </CardBody>
                        <CardFoot
                            left={<button className="btn" type="button" onClick={() => setStep(1)}>← 上一步</button>}
                            right={<button className="btn pri" type="button" onClick={submit}>提交入驻申请</button>}
                        />
                    </Card>
                </>
            )}

            {/* 前两步的校验错误也要看得见 —— 错误只挂在第三步的话，
                在第一步漏填企业名称的人要走到最后才知道 */}
            {step < 2 && err && <div style={{ marginTop: 14 }}><ErrMsg>{err}</ErrMsg></div>}
        </OnboardShell>
    )
}
