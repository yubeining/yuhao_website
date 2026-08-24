/**
 * 定价参数 —— 报价单上那些数字是怎么算出来的，全在这一页。
 *
 * ★ 改这里只影响**之后**的新报价。已经发出去的报价单不会跟着变：
 *   报价行落库时就把算好的单价存死了（actions.submitRfq）。
 *   配置改一次历史单据集体变数，是绝对不能出现的事（CLAUDE.md §10 C2）。
 *
 * ★ 算法本身也摆在页面上。运营改一个「议价空间」，得当场看见它进的是哪个公式，
 *   否则只能靠试 —— 试错的代价是发出去一批算错的报价。
 */

import { useState } from 'react'
import { Field, FieldRow, Input } from '../../components/form'
import { Card, CardBody, CardHead, Cols, Hello, Kv, KvRow, Page, Stack, TableWrap } from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { addRate, saveRates } from '../../mock/actions'

const LABELS = {
    margin: '利润率 %',
    spread: '议价空间 %',
    fx: '汇率 EUR→CNY',
    payDays: '付款 T+N 天',
    grabHours: '抢单超时 小时',
    validDays: '报价有效期 天',
} as const

type ParamKey = keyof typeof LABELS

export function OpsRatesPage() {
    const { state, act } = useMock()

    // 草稿：没动过的字段留空，保存时只写改过的（见 actions.saveRates）
    const [rateDraft, setRateDraft] = useState<Record<number, string>>({})
    const [newMat, setNewMat] = useState('')
    const [newRate, setNewRate] = useState('')
    const [paramDraft, setParamDraft] = useState<Record<string, string>>({})
    const [saved, setSaved] = useState(false)

    // null = 还没人设过。显示为空，不显示 "null"，更不显示一个编的默认值。
    const paramValue = (k: ParamKey) => paramDraft[k] ?? (state.params[k] == null ? '' : String(state.params[k]))

    const save = () => {
        act((s) => saveRates(s, rateDraft, paramDraft))
        setRateDraft({})
        setParamDraft({})
        setSaved(true)
        window.setTimeout(() => setSaved(false), 2000)
    }

    return (
        <Page>
            <Hello
                title="定价参数"
                right={
                    <>
                        {saved && <span style={{ fontSize: 13, color: 'var(--ok)' }}>已保存</span>}
                        <button className="btn pri" type="button" onClick={save}>保存</button>
                    </>
                }
            />
            <Cols>
                <Stack>
                    <Card>
                        <CardHead title="基准制造成本" rid="¥ / 件" />
                        <CardBody flush>
                            {state.rates.length === 0 && (
                                <div style={{ padding: '26px 20px', textAlign: 'center' }}>
                                    <div style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.7 }}>
                                        还没有配置任何材料。<br />
                                        <span style={{ fontSize: 12.5, color: 'var(--faint)' }}>
                                            材料没有主数据表，只能在这里配。一条都没有时，
                                            询价页的材料字段是自由输入，报价也算不出来。
                                        </span>
                                    </div>
                                </div>
                            )}
                            <TableWrap>
                                <thead>
                                    <tr><th>材料</th><th className="n">基准成本</th></tr>
                                </thead>
                                <tbody>
                                    {state.rates.map((r, i) => (
                                        <tr key={r.mat}>
                                            <td className="t1">{r.mat}</td>
                                            <td className="n" style={{ width: 140 }}>
                                                <Input value={rateDraft[i] ?? String(r.rate)}
                                                    style={{ textAlign: 'right' }}
                                                    onChange={(v) => setRateDraft((d) => ({ ...d, [i]: v }))} />
                                            </td>
                                        </tr>
                                    ))}
                                    <tr>
                                        <td>
                                            <Input value={newMat} placeholder="新增材料名"
                                                onChange={setNewMat} />
                                        </td>
                                        <td className="n" style={{ width: 140 }}>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <Input value={newRate} placeholder="¥/件"
                                                    style={{ textAlign: 'right' }}
                                                    onChange={setNewRate} />
                                                <button className="btn sm" type="button"
                                                    disabled={!newMat.trim() || !newRate.trim()}
                                                    onClick={() => {
                                                        act((s) => addRate(s, newMat, newRate))
                                                        setNewMat('')
                                                        setNewRate('')
                                                    }}>
                                                    添加
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </TableWrap>
                        </CardBody>
                    </Card>
                </Stack>

                <Stack>
                    <Card>
                        <CardHead title="系数" />
                        <CardBody>
                            <FieldRow>
                                <ParamField k="margin" value={paramValue('margin')} onChange={setParamDraft} />
                                <ParamField k="spread" value={paramValue('spread')} onChange={setParamDraft} />
                            </FieldRow>
                            <FieldRow>
                                <ParamField k="fx" value={paramValue('fx')} onChange={setParamDraft} />
                                <ParamField k="payDays" value={paramValue('payDays')} onChange={setParamDraft} />
                            </FieldRow>
                            <FieldRow>
                                <ParamField k="grabHours" value={paramValue('grabHours')} onChange={setParamDraft} />
                                <ParamField k="validDays" value={paramValue('validDays')} onChange={setParamDraft} />
                            </FieldRow>
                            <div style={{ fontSize: 12.5, color: 'var(--faint)', marginTop: 10, lineHeight: 1.6 }}>
                                利润率、议价空间、汇率设全（且订单里的材料都配了基准成本）之后才能出报价，
                                缺一项，订单会停在「待估价」。
                            </div>
                        </CardBody>
                    </Card>

                    <Card style={{ marginTop: 16 }}>
                        <CardHead title="算法" />
                        <CardBody>
                            <Kv>
                                <KvRow k="供应商目标价" v="基准成本 × (1 + 议价空间)" sans />
                                <KvRow k="对客单价" v="基准成本 × (1 + 利润率) ÷ 汇率" sans />
                            </Kv>
                        </CardBody>
                    </Card>
                </Stack>
            </Cols>
        </Page>
    )
}

function ParamField({ k, value, onChange }: {
    k: ParamKey
    value: string
    onChange: (fn: (d: Record<string, string>) => Record<string, string>) => void
}) {
    return (
        <Field label={LABELS[k]}>
            <Input value={value} onChange={(v) => onChange((d) => ({ ...d, [k]: v }))} />
        </Field>
    )
}
