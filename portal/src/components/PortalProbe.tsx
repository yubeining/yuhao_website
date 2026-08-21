/**
 * 真实后端的连通性探针 —— 打三端各自的 /whoami，看受众闸门是否按预期放行 / 硬拒。
 *
 * ★ 目前**没有挂在任何路由上**：界面全部走 mock/ 的内存数据仓，不碰后端。
 *   保留它是因为它验证的是 mock 层覆盖不到的东西 —— JWT、拦截器、
 *   受众前缀这条真实链路。等 domain/ 的接口做出来、页面改调 services/ 时，
 *   把它挂到某个内部路由下先跑一遍，比直接改页面再猜哪里断了要快。
 */

import { useEffect, useState } from 'react'
import { http, ApiError } from '../services/core/http'
import type { PartyType } from '../auth/session'

interface WhoAmI {
    userId: string
    partyId: string
    partyType: PartyType
    roles: string[]
}

type ProbeResult = { ok: true; data: WhoAmI } | { ok: false; status: number; code: string }

const PORTAL_PATHS: Record<PartyType, string> = {
    CUSTOMER: '/customer/whoami',
    SUPPLIER: '/supplier/whoami',
    OPERATOR: '/ops/whoami',
}

async function probe(path: string): Promise<ProbeResult> {
    try {
        return { ok: true, data: await http.get<WhoAmI>(path) }
    } catch (e) {
        if (e instanceof ApiError) {
            return { ok: false, status: e.code, code: e.messageCode }
        }
        return { ok: false, status: 0, code: 'common.internal_error' }
    }
}

/**
 * 端级隔离的活体演示。
 *
 * 拿当前的 token 依次去敲三个端的 /whoami：
 *   自己的端     → 200，返回 principal
 *   另外两个端   → 403 common.wrong_portal（后端 PortalGuardInterceptor 拒的）
 *
 * ★ 这不是装饰。它证明的是：跨端隔离由【后端】执行，
 *   哪怕前端 PortalGuard 被绕过（改 localStorage 里的 partyType），
 *   接口照样 403。CLAUDE.md 红线 2 说的就是这件事。
 */
export function PortalProbe({ own }: { own: PartyType }) {
    const [results, setResults] = useState<Record<string, ProbeResult> | null>(null)

    useEffect(() => {
        let cancelled = false
        const entries = Object.entries(PORTAL_PATHS) as [PartyType, string][]
        Promise.all(entries.map(async ([type, path]) => [type, await probe(path)] as const)).then(
            (pairs) => {
                if (!cancelled) {
                    setResults(Object.fromEntries(pairs))
                }
            },
        )
        return () => {
            cancelled = true
        }
    }, [])

    if (!results) {
        return <p className="probe__loading">probing…</p>
    }

    return (
        <table className="probe">
            <thead>
                <tr>
                    <th>端点</th>
                    <th>结果</th>
                    <th>说明</th>
                </tr>
            </thead>
            <tbody>
                {(Object.keys(PORTAL_PATHS) as PartyType[]).map((type) => {
                    const r = results[type]
                    const isOwn = type === own
                    return (
                        <tr key={type} className={r.ok ? 'probe--ok' : 'probe--denied'}>
                            <td>
                                <code>/api/v1{PORTAL_PATHS[type]}</code>
                            </td>
                            <td>{r.ok ? '200' : `${r.status} ${r.code}`}</td>
                            <td>{isOwn ? '本端 —— 应当放行' : '他端 —— 应当被后端硬拒'}</td>
                        </tr>
                    )
                })}
            </tbody>
        </table>
    )
}
