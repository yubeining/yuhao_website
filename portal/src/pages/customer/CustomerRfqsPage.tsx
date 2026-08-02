import { PortalProbe } from '../../components/PortalProbe'

/**
 * 客户端 —— 询价列表。
 *
 * 当前是空壳：domain/rfq 还没有任何 controller / service / entity。
 * 表结构已经建好了（database/migrations/..._03_rfq-and-sourcing.sql）。
 */
export function CustomerRfqsPage() {
    return (
        <section className="page">
            <h2>询价单</h2>
            <p className="page__todo">
                业务功能未实现。后端 <code>domain/rfq</code> 目前是空包，
                表 <code>rfq</code> / <code>rfq_item</code> / <code>rfq_attachment</code> 已建好。
            </p>
            <h3>端级隔离验证</h3>
            <PortalProbe own="CUSTOMER" />
        </section>
    )
}
