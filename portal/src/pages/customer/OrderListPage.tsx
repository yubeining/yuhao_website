/**
 * 我的订单。整条链的入口 —— 建订单、往里加零件、提交订单，都从这里进。
 *
 * ★ 数据全部来自后端（2026-09-14 起客户端不再读假数据）。
 */

import { usePageParam } from '../../components/usePageParam'
import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
    Banner, Card, CardBody, Empty, Hello, Page, Pending, Pill, pill, TableWrap,
} from '../../components/ui'
import { errorText } from '../../i18n/errorText'
import { useI18n } from '../../i18n/I18nProvider'
import { fmtDate } from '../../lib/format'
import { Pagination } from '../../components/Pagination'
import { createOrder, deleteOrder, listOrders, type OrderSummaryView } from '../../services'
import { orderSt } from './status'
import { useConfirm } from '../../components/ConfirmDialog'

export function OrderListPage() {
    const { t } = useI18n()
    const [askConfirm, confirmDialog] = useConfirm()
    const navigate = useNavigate()
    const [orders, setOrders] = useState<OrderSummaryView[] | null>(null)
    const [total, setTotal] = useState(0)
    const [page, setPage] = usePageParam()
    const location = useLocation()
    const [creating, setCreating] = useState(false)
    const [err, setErr] = useState<string | null>(null)

    const load = useCallback(async (pageNo: number) => {
        try {
            const pg = await listOrders(pageNo, 20)
            setOrders(pg.items)
            setTotal(pg.total)
            setErr(null)   // 重新加载成功就收起之前的错误横幅
        } catch (e) {
            setErr(errorText(t, e))
        }
    }, [t])

    useEffect(() => { void load(page) }, [load, page])

    const createDraft = async () => {
        if (creating) return
        setCreating(true)
        try {
            const o = await createOrder({ title: null, wantedDate: null })
            navigate(`/customer/orders/${o.id}`)
        } catch (e) {
            setErr(errorText(t, e))
        } finally {
            setCreating(false)
        }
    }

    const remove = async (id: string) => {
        try {
            await deleteOrder(id)
            await load(page)
        } catch (e) {
            setErr(errorText(t, e))
        }
    }

    return (
        <Page>
            <Hello
                title={t.customer.orders.title}
                sub={t.customer.orders.sub}
                right={
                    <>
                        {orders && <Pill tone="ne" dot={false}>{t.customer.orders.count(total)}</Pill>}
                        {/* ★ 空态时隐藏：中央那个按钮已经能建单，两个入口指向同一个动作 */}
                        {orders && orders.length > 0 && (
                            <button className="btn pri" type="button" disabled={creating} onClick={() => void createDraft()}>
                                {creating ? '…' : t.customer.orders.newOrder}
                            </button>
                        )}
                    </>
                }
            />

            {err && orders !== null && <Banner tone="wa" style={{ marginBottom: 14 }}>{err}</Banner>}

            <Card>
                {orders === null ? (
                    <CardBody><Pending err={err} onRetry={() => void load(page)} /></CardBody>
                ) : orders.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>{t.common.table.name}</th><th className="n">{t.common.table.parts}</th><th className="n">{t.common.table.quantity}</th>
                                    <th className="n">{t.common.table.created}</th><th>{t.common.table.status}</th><th />
                                </tr>
                            </thead>
                            <tbody>
                                {orders.map((o) => (
                                    <tr className="clk" key={o.id}
                                        // 带上列表地址（含页码），详情页的「返回」就回到原来那一页
                                        onClick={() => navigate(`/customer/orders/${o.id}`, { state: { back: location.pathname + location.search } })}>
                                        <td className="t1">{o.title || t.common.untitledOrder}</td>
                                        <td className="n">{o.lineCount}</td>
                                        <td className="n">{o.totalQuantity}</td>
                                        <td className="n">{fmtDate(new Date(o.createdAt))}</td>
                                        <td>{pill(orderSt(t)[o.status])}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            {o.status === 'QUOTED' && (
                                                <button className="linkbtn" type="button"
                                                    onClick={(e) => { e.stopPropagation(); navigate(`/customer/quotes/${o.id}`) }}>
                                                    {t.customer.orders.confirmQuote}
                                                </button>
                                            )}
                                            {o.status === 'DRAFT' && (
                                                <button className="linkbtn" type="button"
                                                    onClick={async (e) => {
                                                        e.stopPropagation()
                                                        // 真删，没有撤销；点错就回不来
                                                        if ((await askConfirm(t.customer.orders.deleteConfirm, { danger: true }))) void remove(o.id)
                                                    }}>{t.customer.orders.deleteOrder}</button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                        <Pagination page={page} pageSize={20} total={total}
                            onChange={setPage} />
                    </CardBody>
                ) : (
                    <CardBody>
                        <Empty
                            text={t.customer.orders.empty}
                            sub={t.customer.orders.emptySub}
                            action={<button className="btn pri" type="button" disabled={creating} onClick={() => void createDraft()}>
                                {creating ? '…' : t.customer.orders.newOrder}
                            </button>}
                        />
                    </CardBody>
                )}
            </Card>
            {confirmDialog}
        </Page>
    )
}
