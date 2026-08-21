/**
 * 抢单大厅。
 *
 * ★ 版式刻意照搬 1688 那类货源大厅：顶部大搜索、多行标签筛选、
 *   排序条、卡片网格。供应商的老板每天就在这类界面里泡着，
 *   照着他熟悉的形状做，培训成本是零。
 *
 * ★ 已被抢走的包不从列表里拿掉，而是置灰留在原地。
 *   拿掉的话大厅看起来永远很空；留着能让人感觉到「手慢了」——
 *   这是抢单机制唯一的驱动力。
 *
 * ★ 筛选和排序目前是纯展示（原型里就没有实现）。数据量到了再接。
 */

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Banner, Empty, Page } from '../../components/ui'
import { DrawingSlot } from '../../components/brand'
import { useMock } from '../../mock/MockProvider'
import { canGrab, grab } from '../../mock/actions'
import { M, hoursLeft } from '../../mock/format'
import { materials } from '../../mock/params'
import type { Pkg } from '../../mock/types'

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
        const base = state.db.pkgs.filter((p) => p.status === 'open' || p.status === 'taken')
        return mat === '全部' ? base : base.filter((p) => p.mat === mat)
    }, [state.db.pkgs, mat])
    const live = all.filter((p) => p.status === 'open')

    const onGrab = (p: Pkg) => {
        const err = actWith((s) => grab(s, p.id))
        if (err) {
            // 包被别人抢走了。留在大厅并让列表自然刷新 —— 比弹窗更贴近真实抢单体验
            return
        }
        navigate('/supplier/won')
    }

    return (
        <Page>
            <div className="hsearch">
                <input placeholder="搜零件名、材料、派单号" />
                <button type="button">搜索</button>
            </div>

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
                <span className="sortcnt">{live.length} 个可抢 · 共 {all.length} 个</span>
            </div>

            {!grabbable && (
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
                <Empty text="大厅暂时没有派单包" />
            )}
        </Page>
    )
}

function PoolCard({ p, grabbable, onOpen, onGrab }: {
    p: Pkg
    grabbable: boolean
    onOpen: () => void
    onGrab: () => void
}) {
    const gone = p.status !== 'open'
    const left = hoursLeft(p.exp)
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
                    <div className="nm2">{p.partName} × {p.qty}</div>
                    <div className="sp2">{p.mat} · {p.surf} · Rev {p.rev}</div>
                </div>
                {/* ★ 单价和合计分两行。原型里挤在一行，卡片 228px 宽只剩 202px，
                    而「¥108.00」+「/ 件 · 合计 ¥10,800.00」要 203px —— 差 1px，
                    两个元素一起折行，价格断成「¥」和「108.00」。
                    金额位数会随订单变，靠宽度刚好放得下是撑不住的。 */}
                <div className="pr">
                    <b>¥ {M(p.target)}</b>
                    <span>/ 件</span>
                </div>
                <div className="prsub">合计 ¥ {M(p.total)}</div>
                <div className="mt2">
                    <span>交付 <b>{p.lead}</b></span>
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
