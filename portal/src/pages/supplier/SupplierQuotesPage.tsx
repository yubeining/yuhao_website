import { PortalProbe } from '../../components/PortalProbe'

/**
 * 供应商端 —— 报价列表。
 *
 * ★ 这一端的每个接口将来都必须有负向测试：看不到别家供应商的报价、
 *   看不到客户身份、看不到对客价（CLAUDE.md §10）。
 *   数据层面的保证是：供应商端只查 sourcing_package 投影，根本碰不到 rfq 表。
 */
export function SupplierQuotesPage() {
    return (
        <section className="page">
            <h2>寻源包与报价</h2>
            <p className="page__todo">
                业务功能未实现。后端 <code>domain/sourcing</code> 目前是空包，
                表 <code>sourcing_package</code> / <code>supplier_quote</code> 已建好。
            </p>
            <h3>端级隔离验证</h3>
            <PortalProbe own="SUPPLIER" />
        </section>
    )
}
