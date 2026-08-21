/**
 * 一个零件一张卡。
 *
 * ★ 为什么是卡不是表格行：**零件是原子，不是清单里的一行**。
 *   一个零件带着自己的图纸（真实数据里平均 3 个文件）、自己的规格、自己的数量。
 *   摊平成表格行之后，「这几个文件属于这个零件」这件事就没地方放了 ——
 *   只能另起一张表再用下标指回来，那是把从属关系写反。
 *
 * ★ 图号和版本从图纸文件名来，是**只读**的：客户不会手写图号，
 *   他发的就是图纸。手工加的零件才让填。
 */

import { useRef } from 'react'
import { pill } from './ui'
import type { PillSpec } from './ui'
import { Input, Select } from './form'
import { humanSize } from '../mock/drawing'
import type { LineStat, RfqLine } from '../mock/types'

const STAT: Record<LineStat, PillSpec> = {
    ready: ['ok', '可报价'],
    pending: ['wa', '待确认'],
    blocked: ['ba', '缺必填'],
}

interface Props {
    index: number
    line: RfqLine
    stat: LineStat
    materials: string[]
    surfaces: string[]
    showRefs: boolean
    onChange: (k: keyof RfqLine, v: string) => void
    onRemove: () => void
    /** 给这个零件补图纸。图纸属于零件，所以入口在零件自己身上 */
    onAddFiles: (files: { name: string; size: number }[]) => void
    onRemoveFile: (fileName: string) => void
}

export function PartCard({
    index, line, stat, materials, surfaces, showRefs,
    onChange, onRemove, onAddFiles, onRemoveFile,
}: Props) {
    const tone = stat === 'blocked' ? 'bad' : stat === 'pending' ? 'warn' : ''
    const input = useRef<HTMLInputElement>(null)

    const pick = (list: FileList | null) => {
        if (!list?.length) return
        onAddFiles(Array.from(list).map((f) => ({ name: f.name, size: f.size })))
        if (input.current) input.current.value = ''
    }
    return (
        <div className={`pcard ${tone}`}>
            <div className="pcard-hd">
                <span className="pcard-n">{index + 1}</span>
                <div className="pcard-id">
                    {/* ★ 图号一律可编辑。填着的值是从**客户自己的文件名里读出来的**，
                        我方反推的数字串不往这里填 —— 客户不认识那串数字。 */}
                    <Input value={line.no} placeholder="图号" style={{ width: 168 }}
                        onChange={(v) => onChange('no', v)} />
                    <Input value={line.rev} placeholder="版本" style={{ width: 74 }}
                        onChange={(v) => onChange('rev', v)} />
                    {/* 还没填图号时，用客户自己的文件名认这张卡 */}
                    {!line.no.trim() && line.files.length > 0 && (
                        <span className="pcard-hint" title={line.files[0].name}>
                            {line.files[0].name}
                        </span>
                    )}
                </div>
                <span className="sp" />
                {pill(STAT[stat])}
                <button className="btn qui sm" type="button" onClick={onRemove}>移除</button>
            </div>

            <div className="pcard-bd">
                <label className="pf">
                    <span className="pf-k">名称 *</span>
                    <Input value={line.name} placeholder="零件名称" onChange={(v) => onChange('name', v)} />
                </label>
                <label className="pf">
                    <span className="pf-k">数量 *</span>
                    <Input value={String(line.qty)} placeholder="件" onChange={(v) => onChange('qty', v)} />
                </label>
                <label className="pf">
                    <span className="pf-k">材料</span>
                    <Select value={line.mat} options={['', ...materials]} onChange={(v) => onChange('mat', v)} />
                </label>
                <label className="pf">
                    <span className="pf-k">表面处理</span>
                    <Select value={line.surf} options={surfaces} onChange={(v) => onChange('surf', v)} />
                </label>
            </div>

            {showRefs && (
                <div className="pcard-bd refs">
                    <label className="pf">
                        <span className="pf-k">任务编号</span>
                        <Input value={line.taskNo ?? ''} placeholder="选填" onChange={(v) => onChange('taskNo', v)} />
                    </label>
                    <label className="pf">
                        <span className="pf-k">系统号</span>
                        <Input value={line.systemNo ?? ''} placeholder="选填" onChange={(v) => onChange('systemNo', v)} />
                    </label>
                    <label className="pf">
                        <span className="pf-k">课题号</span>
                        <Input value={line.topicNo ?? ''} placeholder="选填" onChange={(v) => onChange('topicNo', v)} />
                    </label>
                </div>
            )}

            <div className="pcard-ft">
                <input ref={input} type="file" multiple hidden onChange={(e) => pick(e.target.files)} />
                <span className="pcard-fk">
                    {line.files.length ? `图纸 ${line.files.length} 个` : '还没有图纸'}
                </span>
                <div className="pcard-files">
                    {line.files.map((f) => (
                        <span className="fchip" key={f.name} title={f.name}>
                            <span className="fx">{(f.name.split('.').pop() || '').toUpperCase()}</span>
                            <b>{f.name}</b>
                            <i>{humanSize(f.size)}</i>
                            <button type="button" className="fdel" title="移除这份图纸"
                                onClick={() => onRemoveFile(f.name)}>×</button>
                        </span>
                    ))}
                    <button className="btn qui sm" type="button" onClick={() => input.current?.click()}>
                        ＋ 加图纸
                    </button>
                </div>
            </div>

            {stat === 'pending' && (
                <div className="pcard-why">
                    缺{!String(line.rev).trim() ? '图纸版本' : ''}
                    {!String(line.rev).trim() && !String(line.mat).trim() ? '和' : ''}
                    {!String(line.mat).trim() ? '材料' : ''}
                    。这个零件会收进询价单，但不进报价 —— 材料是定价的直接输入。
                    我们会看图补齐，再请你确认。
                </div>
            )}
            {stat === 'blocked' && (
                <div className="pcard-why">图号、名称、数量是必填的，缺了收不进来。</div>
            )}
        </div>
    )
}
