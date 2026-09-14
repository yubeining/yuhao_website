/**
 * 我的报价。
 *
 * ★ 报价还没接上后端（第 3 步），这里如实显示「暂无」，不再展示假数据里的报价 ——
 *   否则客户会对着一份不存在的报价去确认价格（CLAUDE.md §10 C5）。
 */

import { Card, CardBody, Empty, Hello, Page } from '../../components/ui'

export function QuoteListPage() {
    return (
        <Page>
            <Hello title="我的报价" />
            <Card>
                <CardBody>
                    <Empty text="暂无报价" sub="订单提交后，报价会出现在这里" />
                </CardBody>
            </Card>
        </Page>
    )
}
