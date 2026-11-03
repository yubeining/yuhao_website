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
import { useI18n } from '../../i18n/I18nProvider'

/** 占位符。原来从 mock/format 借 X —— 这页不再依赖 mock 层，自己定义。 */
const PENDING = '——'

export function OpsDashboardPage() {
    const { t } = useI18n()
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
            <Hello title={t.ops.dashboard.title} />
            {failed && (
                <Banner tone="wa">
                    <b>{t.ops.dashboard.failedTitle}</b>{t.ops.dashboard.failedBody}
                </Banner>
            )}
            <Kpis>
                <Kpi k={t.ops.dashboard.kpiPending} v={n(data?.pendingAssembly)} d={t.ops.dashboard.kpiPendingSub} alert />
                <Kpi k={t.ops.dashboard.kpiAssembling} v={n(data?.assembling)} d={t.ops.dashboard.kpiAssemblingSub} />
                <Kpi k={t.ops.dashboard.kpiOffered} v={n(data?.offered)} d={t.ops.dashboard.kpiOfferedSub} />
            </Kpis>

            <Card>
                <CardHead title={t.ops.dashboard.missingTitle} />
                <CardBody>
                    <Empty
                        text={t.ops.dashboard.missingText}
                        sub={t.ops.dashboard.missingSub}
                    />
                </CardBody>
            </Card>
        </Page>
    )
}
