/**
 * 订单市场。
 *
 * ★ 版式刻意照搬 1688 那类货源大厅：顶部大搜索、多行标签筛选、
 *   排序条、卡片网格。供应商的老板每天就在这类界面里泡着，
 *   照着他熟悉的形状做，培训成本是零。
 *
 * ★★ 市场上挂的是**生产订单**，不是客户订单。一个生产订单是我方组好的一批活，
 *   可能装着几个客户的零件 —— 供应商看到的只有零件名、材料、数量，
 *   **看不到图号，也看不到是谁的货**（文档 7 §8 脱敏要求）。
 *   整单抢走，一个生产订单一个供应商（设计文档 3 §2.4）。
 *
 * ★ 已被抢走的包不从列表里拿掉，而是置灰留在原地。
 *   拿掉的话市场看起来永远很空；留着能让人感觉到「手慢了」——
 *   这是抢单机制唯一的驱动力。
 *
 * ★ 筛选和排序目前是纯展示（原型里就没有实现）。数据量到了再接。
 */

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    Banner, Empty, Page, PrototypeBanner,
} from '../../components/ui'
import { DrawingSlot } from '../../components/brand'
import { useMock } from '../../mock/MockProvider'
import { canGrab, grab } from '../../mock/actions'
import { M, hoursLeft } from '../../mock/format'
import { materials } from '../../mock/params'
import type { Prod } from '../../mock/types'

export function HallPage() {
    const { state, actWith } = useMock()
    const navigate = useNavigate()
    const grabbable = canGrab(state)

    // ★ 只按材料筛。品类、交付周期区间、「可立即开工」这些维度模型里根本没有字段，
    //   原型里那几行标签是编出来的 —— 点了不生效，还让人以为平台掌握这些信息。
    //   有 p.mat 才有材料筛选，其余等数据模型真的长出这些字段再加。
    const matOptions = ['全部', ...materials(state.rates)]
    const [mat, setMat] = useState('全部')

    const all = useMemo(() => {
        const base = state.db.prods.filter((d) => d.status === 'open' || d.status === 'taken')
        // ★ 一单多行：任意一行是这个材料就算命中
        return mat === '全部' ? base : base.filter((d) => d.lines.some((l) => l.mat === mat))
    }, [state.db.prods, mat])
    const live = all.filter((p) => p.status === 'open')

    const onGrab = (p: Prod) => {
        const err = actWith((s) => grab(s, p.id))
        if (err) {
            // 包被别人抢走了。留在市场并让列表自然刷新 —— 比弹窗更贴近真实抢单体验
            return
        }
        navigate('/supplier/won')
    }

    return (
        <Page>
            <PrototypeBanner />
            {/* ★ 搜索框已删（2026-09-09）：按钮无 onClick、输入框无 state，搜不动。
                更糟的是搜不到会被当成"市场里没有这类活"，而不是"这个框是假的"。 */}

            <div className="card" style={{ marginBottom: 4 }}>
                <div className="cbody" style={{ padding: '4px 18px' }}>
                    <div className="frow">
                        <span className="fk">材料</span>
                        <span className="fv">
                            {matOptions.map((o) => (
                                <button className={`ftag ${o === mat ? 'on' : ''}`} type="button" key={o}
                                    onClick={() => setMat(o)}>
                                    {o}
                                </button>
                            ))}
                        </span>
                    </div>
                </div>
            </div>

            <div className="sortrow">
                <span className="sortsp" />
                {/* 原型数据仓是空的时候不显示「0 个可抢」—— 那是一个没有数据来源的数 */}
                {all.length > 0 && <span className="sortcnt">{live.length} 个可抢 · 共 {all.length} 个</span>}
            </div>

            {/* 原型里「资质考察」只存在于浏览器里的数据仓，真实供应商没有这个状态，数据仓为空时不提示 */}
            {!grabbable && all.length > 0 && (
                <Banner tone="wa" style={{ marginBottom: 16 }}>
                    资质考察通过后才能抢单，现在可以先浏览。
                </Banner>
            )}

            {all.length ? (
                <div className="pgrid">
                    {all.map((p) => (
                        <PoolCard key={p.id} p={p} grabbable={grabbable}
                            onOpen={() => navigate(`/supplier/hall/${p.id}`)}
                            onGrab={() => onGrab(p)} />
                    ))}
                </div>
            ) : (
                <Empty text="市场上暂时没有生产订单" />
            )}
        </Page>
    )
}

function PoolCard({ p, grabbable, onOpen, onGrab }: {
    p: Prod
    grabbable: boolean
    onOpen: () => void
    onGrab: () => void
}) {
    const gone = p.status !== 'open'
    const left = hoursLeft(p.exp)
    const qty = p.lines.reduce((a, l) => a + l.qty, 0)
    const mats = [...new Set(p.lines.map((l) => l.mat).filter(Boolean))]
    const leads = [...new Set(p.lines.map((l) => l.wantLead))]
    const head = p.lines[0]
    return (
        <div className={`pcd ${gone ? 'gone' : ''}`} onClick={gone ? undefined : onOpen}>
            <div className="im">
                {/* ★ 图纸文件从文件库来。上传接口没做，现在一律空，界面显示「暂无图纸」。
                    绝不在这里放示意形状 —— 供应商会照着它估工时。 */}
                <DrawingSlot files={[]} />
                <span className={`tag2 ${gone ? 'gone' : ''}`}>
                    {gone ? '已被抢' : left === 0 ? '已超时' : `剩 ${left} 小时`}
                </span>
            </div>
            <div className="bd">
                <div>
                    {/* ★ 一单多行，卡片上放不下每一行 —— 给第一行的名字加一句「等 N 个零件」，
                        具体清单在详情页。数量给的是整单总件数，不是某一行的。 */}
                    <div className="nm2">
                        {head?.partName ?? '空单'}
                        {p.lines.length > 1 ? ` 等 ${p.lines.length} 个零件` : ''}
                    </div>
                    <div className="sp2">
                        {mats.length ? mats.slice(0, 2).join(' · ') : '材料未定'}
                        {mats.length > 2 ? ` 等 ${mats.length} 种` : ''} · 共 {qty} 件
                    </div>
                </div>
                {/* ★ 只给整单合计，**不给单价** —— 一单里各行的单价本来就不同，
                    平均出来的那个数不对应任何一件东西，看的人会拿它去估自己的成本。 */}
                <div className="pr">
                    <b>¥ {M(p.total)}</b>
                    <span>整单</span>
                </div>
                <div className="prsub">{p.lines.length} 行 · 共 {qty} 件</div>
                <div className="mt2">
                    {/* ★ 各行的客户交期可能不一样，不同就明说不同，不挑一个当代表 */}
                    <span>客户要求交期 <b>{leads.length === 1 ? leads[0] : '按行不同'}</b></span>
                    <span>{p.reprice ? `已调价 ${p.reprice} 次` : ''}</span>
                </div>
                <div className="pay">付款 <b>{p.pay}</b></div>
                <div className="mt2">
                    <span />
                    <span className="m">{p.id}</span>
                </div>
                <div className="bt">
                    {gone ? (
                        <span style={{ fontSize: 11.5, color: 'var(--faint)', padding: '7px 0' }}>
                            已被其他供应商抢走
                        </span>
                    ) : (
                        <>
                            <button className="btn" type="button"
                                onClick={(e) => { e.stopPropagation(); onOpen() }}>
                                详情
                            </button>
                            <button className="btn pri" type="button" disabled={!grabbable}
                                onClick={(e) => { e.stopPropagation(); onGrab() }}>
                                抢单
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
