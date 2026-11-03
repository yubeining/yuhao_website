/**
 * 客户订单总览。
 *
 * ★★ 这里是**客户订单**，不是生产订单。两者不是一个概念：
 *   客户订单是客户表达「我要这些」，生产订单是我方组出来交给一家做的一批活。
 *   一个客户订单的零件可能分散在好几个生产订单里，见「派单管理」。
 *
 * ★ 发货和回款登记放在这一页而不是派单管理：两者都是**对客户**的动作，
 *   按客户订单发生。生产订单可能装着好几个客户的零件，在那边按整单发货是错的。
 */

import { Link } from 'react-router-dom'
import {
    Bar, Card, CardBody, Empty, Hello, Page, pill, Pill, PrototypeBanner, TableWrap,
} from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { custPaid, deliver, findCompany } from '../../mock/actions'
import { money } from '../../mock/format'
import { orderTotal, progress, prodsOf } from '../../mock/selectors'
import { ORD_ST } from '../customer/status'

export function OpsOrdersPage() {
    const { state, act, t } = useMock()
    const orders = state.db.orders

    return (
        <Page>
            <PrototypeBanner />
            <Hello title={t.ops.orders.title} />
            <Card>
                {orders.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>{t.common.table.order}</th><th>{t.ops.orders.colCustomer}</th><th className="n">{t.common.table.parts}</th><th className="n">{t.supplier.bill.colAmount}</th>
                                    <th className="n">{t.ops.orders.colCreated}</th><th>{t.ops.orders.colProd}</th><th>{t.ops.orders.colProgress}</th>
                                    <th>{t.ops.orders.colPaid}</th><th>{t.common.table.status}</th><th /><th />
                                </tr>
                            </thead>
                            <tbody>
                                {orders.map((o) => (
                                    <tr className="clk" key={o.id}>
                                        <td><span className="m">{o.id}</span></td>
                                        <td className="t1">{findCompany(state, o.companyId)?.name}</td>
                                        <td className="n">{o.parts.length}</td>
                                        <td className="n">{money(orderTotal(state, o))}</td>
                                        <td className="n">{o.at.slice(0, 10)}</td>
                                        <td>
                                            {/* ★ 一个客户订单的零件可能分散在几个生产订单里 */}
                                            {prodsOf(state, o.id).length
                                                ? prodsOf(state, o.id).map((d) => (
                                                    <Link key={d.id} className="m" style={{ marginRight: 8 }}
                                                        to={`/ops/dispatch/${d.id}`}>{d.id}</Link>
                                                ))
                                                : <span className="t2">{t.ops.orders.unscheduled}</span>}
                                        </td>
                                        <td style={{ minWidth: 100 }}><Bar pct={progress(o)} /></td>
                                        <td>
                                            {o.paidAt ? <Pill tone="ok">{t.ops.orders.paid}</Pill> : <Pill tone="wa">{t.ops.orders.unpaid}</Pill>}
                                        </td>
                                        <td>{pill(ORD_ST[o.status])}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            {o.status === 'produced' && (
                                                <button className="btn sm" type="button"
                                                    onClick={() => act((s) => deliver(s, o.id))}>
                                                    {t.ops.orders.markDelivered}
                                                </button>
                                            )}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            {o.status === 'shipping' && !o.paidAt && (
                                                <button className="btn sm" type="button"
                                                    onClick={() => act((s) => custPaid(s, o.id))}>
                                                    {t.ops.orders.registerPayment}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                ) : (
                    <CardBody><Empty text={t.ops.orders.empty} /></CardBody>
                )}
            </Card>
        </Page>
    )
}
