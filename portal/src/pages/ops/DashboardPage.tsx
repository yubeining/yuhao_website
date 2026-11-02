/**
 * 运营工作台。
 *
 * ★ 只显示后端真有来源的三个计数（口径见后端 `OpsDashboardController`）。
 *   原先那五个指标里，「已安排生产（产能没锁满）」和「待考察供应商（已提交材料）」
 *   在后端没有对应字段或状态 —— 按 CLAUDE.md §10 C5，没有来源就整块不显示，
 *   而不是留一个占位符。占位符一旦上线就没人记得它是假的。
 */

import { useEffect, useState } from 'react'
import {
    Banner, Card, CardBody, CardHead, Empty, Hello, Kpi, Kpis, Page,
} from '../../components/ui'
import { getOpsDashboard, type OpsDashboardView } from '../../services'

/** 占位符。原来从 mock/format 借 X —— 这页不再依赖 mock 层，自己定义。 */
const PENDING = '——'

export function OpsDashboardPage() {
    const [data, setData] = useState<OpsDashboardView | null>(null)
    const [failed, setFailed] = useState(false)

    useEffect(() => {
        let alive = true
        getOpsDashboard()
            .then((d) => { if (alive) setData(d) })
            .catch(() => { if (alive) setFailed(true) })
        return () => { alive = false }
    }, [])

    /** 没取到就显示占位符 —— 不显示 0：0 会被读成「真的没有待办」。 */
    const n = (v?: number) => (v == null ? PENDING : v)

    return (
        <Page>
            <Hello title="工作台" />
            {failed && (
                <Banner tone="wa">
                    <b>工作台数据没取到。</b>下面的数字是占位符，不要据此安排生产。
                </Banner>
            )}
            <Kpis>
                <Kpi k="待安排生产" v={n(data?.pendingAssembly)} d="已确认价格，等运营组包" alert />
                <Kpi k="组包中" v={n(data?.assembling)} d="草稿，还没挂出去" />
                <Kpi k="在挂生产订单" v={n(data?.offered)} d="等供应商接单" />
            </Kpis>

            <Card>
                <CardHead title="还没放上来的两个指标" />
                <CardBody>
                    <Empty
                        text="「已安排生产（产能没锁满）」和「待考察供应商（已提交材料）」在后端没有对应字段或状态。"
                        sub="口径定下来再放上来 —— 现在硬凑一个映射，数字看着像真的，但没人能解释它怎么算出来的。"
                    />
                </CardBody>
            </Card>
        </Page>
    )
}
