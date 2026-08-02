import { PortalProbe } from '../../components/PortalProbe'

/**
 * 内部后台 —— 总览。
 *
 * ops 端内部还有一层细粒度权限（销售不该改质检结论），
 * 由 RouteAccessRegistry + AccessInterceptor 处理，查 access_grant 表。
 */
export function OpsDashboardPage() {
    return (
        <section className="page">
            <h2>总览</h2>
            <p className="page__todo">
                业务功能未实现。<code>domain/</code> 下 14 个业务包目前全是空包，
                4 个迁移建的表已就位。
            </p>
            <h3>端级隔离验证</h3>
            <PortalProbe own="OPERATOR" />
        </section>
    )
}
