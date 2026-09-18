/**
 * 内部工作台 —— 原型页，还没接后端（2026-09-18：原型页保留，假数据删除）。
 *
 * ★ 只保留五个指标的名字和说明，值一律占位。接后端时：
 *   只有「待考察供应商」该转黄 —— 那是唯一一件我方拖着不动就会出问题的事；
 *   其余是客户侧和供应商侧在推进的进度，纯计数，不给行动按钮。
 */

import {
    Card, CardBody, CardHead, Empty, Hello, Kpi, Kpis, Page, PrototypeBanner,
} from '../../components/ui'
import { X } from '../../mock/format'

export function OpsDashboardPage() {
    return (
        <Page>
            <PrototypeBanner />
            <Hello title="工作台" />
            {/* ★ 下面的计数和列表还没接后端。以前显示的是原型数据仓算出来的数（包括「0」），
                 线上明明有已确认的单也显示 0 —— 所以数字一律显示占位符，不显示计数。 */}
            <Kpis>
                <Kpi k="待安排生产" v={X} d="已确认价格，等运营组包" />
                <Kpi k="组包中" v={X} d="草稿，还没挂出去" />
                <Kpi k="在挂生产订单" v={X} d="等供应商接单" />
                <Kpi k="已安排生产" v={X} d="产能还没锁满的客户订单" />
                <Kpi k="待考察供应商" v={X} d="已提交材料" />
            </Kpis>

            <Card>
                <CardHead title="已确认价格，等运营组包" />
                <CardBody><Empty text="还没接真实数据" sub="已确认报价的订单目前在「报价 → 已确认」里看" /></CardBody>
            </Card>
        </Page>
    )
}
