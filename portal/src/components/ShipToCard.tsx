/**
 * 订单收货地址卡片（2026-11-23）。客户订单详情和运营报价工作台共用这一份只读展示。
 *
 * ★ 只放在客户端和运营端：设计文档 1 §3.2 不向供应商暴露客户的收货地址，供应商页面不要引用它。
 * ★ 没填过就明说「还没填」，不编一个占位地址（CLAUDE.md §10 C5）。
 */

import type { ReactNode } from 'react'
import { useI18n } from '../i18n/I18nProvider'
import { countryName } from '../i18n/countries'
import type { ShipTo } from '../services'
import { Card, CardBody, CardHead } from './ui'

export function ShipToCard({ shipTo, action, note }: {
    shipTo?: ShipTo | null
    /** 卡片右上角的操作（客户端的「填写 / 编辑」） */
    action?: ReactNode
    /** 地址下方的一行说明 */
    note?: ReactNode
}) {
    const { t, lang } = useI18n()
    const s = t.shipTo
    const cityLine = shipTo ? [shipTo.postalCode, shipTo.city, shipTo.region].filter(Boolean).join(' ') : ''
    return (
        <Card style={{ marginBottom: 16 }}>
            <CardHead title={s.title} right={action} />
            <CardBody>
                {shipTo ? (
                    <div style={{ lineHeight: 1.7 }}>
                        <div className="t1">{shipTo.company}</div>
                        <div>{shipTo.contact} · <span className="m">{shipTo.phone}</span></div>
                        <div>{shipTo.line1}</div>
                        {shipTo.line2 && <div>{shipTo.line2}</div>}
                        <div>{cityLine}</div>
                        <div>{countryName(shipTo.country, lang)}</div>
                    </div>
                ) : (
                    <div className="t2" style={{ color: 'var(--muted)' }}>{s.empty}</div>
                )}
                {note && <div className="t2" style={{ color: 'var(--muted)', marginTop: 10 }}>{note}</div>}
            </CardBody>
        </Card>
    )
}
