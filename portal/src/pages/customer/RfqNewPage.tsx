/**
 * 提交新询价。
 *
 * ★★ 版式：**表单是主体，拖图纸是加速器**。
 *
 *   照寄快递那一套 —— 那个页面首先是收件人 / 电话 / 地址的输入框，
 *   旁边挂一个「智能识别」：粘一段文字进去，自动把三个框填上。
 *   识别是给表单提速的，不是表单的前置步骤。**没有识别，表单照样能用完。**
 *
 *   所以这一页打开就是一张空零件表，可以直接手填；
 *   拖图纸进来只是自动把图号和版本填上，并把图纸挂到对应零件下面。
 *
 * ★ 零件是原子，图纸挂在零件里面（`RfqLine.files`），询价单这一层不持有任何文件。
 *
 * ★ 三档状态（设计文档 9 §4.1）：可报价 / 待确认 / 缺必填。
 *   版本和材料缺失只是「待确认」，不阻断提交 —— 真实客户清单里本来就没有这两列。
 */

import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Input } from '../../components/form'
import { PartCard } from '../../components/PartCard'
import {
    Banner, Card, CardBody, CardFoot, CardHead, Hello, Page, Pill,
} from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { lineStat, submitRfq } from '../../mock/actions'
import { groupByPart, parseDrawingName } from '../../mock/drawing'
import { materials, SURFACES } from '../../mock/params'
import type { RfqLine } from '../../mock/types'

const blankPart = (): RfqLine => ({
    no: '', name: '', rev: '', mat: '', qty: '', surf: SURFACES[0], files: [],
})

/** 还是全空的卡 —— 识别出来的零件优先往这种卡上填，而不是另起一张 */
const isBlank = (p: RfqLine) =>
    !p.no.trim() && !p.name.trim() && !String(p.qty).trim() && p.files.length === 0

export function RfqNewPage() {
    const { state, actWith } = useMock()
    const navigate = useNavigate()
    const mats = materials(state.rates)
    const input = useRef<HTMLInputElement>(null)

    // ★ 打开就有一张空表可以填。识别是可选的加速手段，不是必经步骤。
    const [parts, setParts] = useState<RfqLine[]>([blankPart()])
    /**
     * 与 parts 平行的内部分组键（图号归一化后的数字串）。
     * 只用来把同一零件的多份图纸归到一起，**绝不显示** ——
     * 它是我方反推的，客户不认识那串数字。
     */
    const [keys, setKeys] = useState<string[]>([''])
    const [want, setWant] = useState('')
    const [showRefs, setShowRefs] = useState(false)
    const [dragging, setDragging] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [note, setNote] = useState<string | null>(null)

    const stats = parts.map(lineStat)
    const ready = stats.filter((s) => s === 'ready').length
    const pending = stats.filter((s) => s === 'pending').length
    const blocked = stats.filter((s) => s === 'blocked').length

    /**
     * 识别一批图纸 → 填进表单。
     * 优先往空白卡上填，填不下才新建；同图号的图纸并到同一张卡。
     */
    const recognize = (list: FileList | null) => {
        if (!list?.length) return
        const incoming = Array.from(list).map((f) => ({ name: f.name, size: f.size }))
        const { groups, orphans } = groupByPart(incoming)

        const nextParts = [...parts]
        const nextKeys = [...keys]
        let filled = 0
        let created = 0

        const put = (patch: Partial<RfqLine>, key: string, files: RfqLine['files']) => {
            const slot = nextParts.findIndex(isBlank)
            if (slot >= 0) {
                nextParts[slot] = { ...nextParts[slot], ...patch, files }
                nextKeys[slot] = key
                filled++
            } else {
                nextParts.push({ ...blankPart(), ...patch, files })
                nextKeys.push(key)
                created++
            }
        }

        for (const g of groups) {
            const hit = nextKeys.findIndex((k, i) => k && k === g.partDigits && !isBlank(nextParts[i]))
            if (hit >= 0) {
                const exist = new Set(nextParts[hit].files.map((f) => f.name))
                nextParts[hit] = {
                    ...nextParts[hit],
                    rev: nextParts[hit].rev || g.rev,
                    files: [...nextParts[hit].files, ...g.files.filter((f) => !exist.has(f.name))],
                }
                filled++
            } else {
                // ★ 只有文件名里写着可读图号时才填。反推出来的数字串不填。
                put({ no: g.partNo, rev: g.rev }, g.partDigits, g.files)
            }
        }
        // 认不出图号的也照样挂成零件 —— 业务上不存在不属于任何零件的图纸
        for (const f of orphans) put({ rev: f.revFromName }, '', [f])

        setParts(nextParts)
        setKeys(nextKeys)
        setErr(null)
        setNote(`识别了 ${incoming.length} 个文件 · 填入 ${filled} 个零件 · 新建 ${created} 个`)
        if (input.current) input.current.value = ''
    }

    const addFilesTo = (i: number, fs: { name: string; size: number }[]) => {
        setParts((prev) => prev.map((p, j) => {
            if (j !== i) return p
            const exist = new Set(p.files.map((f) => f.name))
            const add = fs.filter((f) => !exist.has(f.name))
                .map((f) => ({ ...f, revFromName: parseDrawingName(f.name).rev }))
            return {
                ...p,
                rev: p.rev || add.find((f) => f.revFromName)?.revFromName || '',
                files: [...p.files, ...add],
            }
        }))
        setErr(null)
    }

    const removeFileFrom = (i: number, name: string) => {
        setParts((prev) => prev.map((p, j) =>
            (j === i ? { ...p, files: p.files.filter((f) => f.name !== name) } : p)))
    }

    const setField = (i: number, k: keyof RfqLine, v: string) => {
        setParts((prev) => prev.map((p, j) => (j === i ? { ...p, [k]: v } : p)))
        setErr(null)
    }

    const addPart = () => {
        setParts((prev) => [...prev, blankPart()])
        setKeys((prev) => [...prev, ''])
        setErr(null)
    }

    const removePart = (i: number) => {
        setParts((prev) => (prev.length > 1 ? prev.filter((_, j) => j !== i) : [blankPart()]))
        setKeys((prev) => (prev.length > 1 ? prev.filter((_, j) => j !== i) : ['']))
    }

    const submit = () => {
        const kept = parts.filter((p) => lineStat(p) !== 'blocked')
        if (!kept.length) {
            setErr('至少要有一个零件填上图号、名称和数量')
            return
        }
        const quote = actWith((s) => submitRfq(s, kept.map((p) => ({ ...p })), want))
        navigate(quote ? `/customer/quotes/${quote.id}` : '/customer/rfqs')
    }

    return (
        <Page>
            <Hello
                back={<Link className="btn sm qui" to="/customer/rfqs" style={{ margin: '0 0 6px -9px' }}>← 我的询价</Link>}
                title="提交新询价"
            />

            <input ref={input} type="file" multiple hidden onChange={(e) => recognize(e.target.files)} />

            {/* ★ 识别条。做得比表单轻、不占版面重心 —— 它是加速器，跳过它也能把单子提交完。 */}
            <div
                className={`recog ${dragging ? 'on' : ''}`}
                onClick={() => input.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); recognize(e.dataTransfer.files) }}
            >
                <span className="recog-ic">⇥</span>
                <div className="recog-tx">
                    <b>把图纸拖到这里，自动填图号和版本</b>
                    <span>整单的图纸可以一次全拖进来，按文件名分到各个零件下面。不用它也行，下面可以直接手填。</span>
                </div>
                <span className="recog-btn">选择文件</span>
            </div>

            {note && (
                <div className="recog-note">
                    <span>{note}</span>
                    <button type="button" onClick={() => setNote(null)}>知道了</button>
                </div>
            )}

            {err && <Banner tone="wa" style={{ marginBottom: 14 }}>{err}</Banner>}

            {pending > 0 && (
                <Banner tone="in" style={{ marginBottom: 14 }}>
                    有 {pending} 个零件缺版本或材料 —— <strong>照常提交即可</strong>。
                    多数图纸文件名里没写版本，材料更是只有图上才有。
                    我们会看图补齐再请你确认，这些零件不进这一次的报价。
                </Banner>
            )}

            <Card>
                <CardHead
                    title={`零件 ${parts.length} 个`}
                    right={
                        <>
                            {ready > 0 && <Pill tone="ok">{ready} 可报价</Pill>}
                            {pending > 0 && <Pill tone="wa">{pending} 待确认</Pill>}
                            {blocked > 0 && <Pill tone="ba">{blocked} 缺必填</Pill>}
                            <button className="btn qui sm" type="button" onClick={() => setShowRefs((v) => !v)}>
                                {showRefs ? '隐藏' : '显示'}你的编号
                            </button>
                        </>
                    }
                />
                <CardBody>
                    <div className="parts">
                        {parts.map((p, i) => (
                            <PartCard
                                key={i}
                                index={i}
                                line={p}
                                stat={stats[i]}
                                materials={mats}
                                surfaces={SURFACES}
                                showRefs={showRefs}
                                onChange={(k, v) => setField(i, k, v)}
                                onRemove={() => removePart(i)}
                                onAddFiles={(fs) => addFilesTo(i, fs)}
                                onRemoveFile={(name) => removeFileFrom(i, name)}
                            />
                        ))}
                    </div>
                </CardBody>
                <CardFoot
                    left={<button className="btn" type="button" onClick={addPart}>＋ 添加零件</button>}
                    right={
                        <>
                            <div className="rng" style={{ marginRight: 10 }}>
                                交期要求 <Input value={want} placeholder="天" onChange={setWant} />
                            </div>
                            <button className="btn pri" type="button" onClick={submit}>
                                {ready > 0
                                    ? `提交并获取 ${ready} 个零件的报价 →`
                                    : '提交询价（待我们补齐后报价）→'}
                            </button>
                        </>
                    }
                />
            </Card>

            {/* ★ 必须说清楚，否则客户以为图纸已经交上来了 */}
            <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>
                当前版本只读取文件名做识别，<strong>文件尚未上传到服务器</strong>。
                存储接口做好之后这里会真正上传并生成脱敏副本。
            </div>
        </Page>
    )
}
