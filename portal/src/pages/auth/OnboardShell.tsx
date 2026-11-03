/**
 * 入驻类页面的独立外壳 —— 邮箱验证、供应商邀请、入驻向导都用它。
 *
 * ★ 这些页面刻意不套 AppShell：走到这里的人还没有身份，
 *   给他看侧栏导航等于给他看一堆点不动的东西。
 */

import type { ReactNode } from 'react'
import { Logo } from '../../components/brand'

export function OnboardShell({ children, right, slim }: {
    children: ReactNode
    /** 顶部右侧的次要出口，通常是「返回登录」 */
    right?: ReactNode
    /** 单卡片的窄版式（验证、邀请、完成页） */
    slim?: boolean
}) {
    return (
        <div className="onbwrap">
            <div className={`onb${slim ? ' slim' : ''}`}>
                <div className="onbhd">
                    <div className="gl"><Logo /></div>
                    {/* i18n-exempt-start: 品牌名不译 */}
                    <div className="nm">融一智造</div>
                    {/* i18n-exempt-end */}
                    <span className="sp" />
                    {right}
                </div>
                {children}
            </div>
        </div>
    )
}

/** 居中的大图标提示卡。验证 / 邀请 / 完成三页共用同一个版式。 */
export function NoticeCard({ mark, tone, title, sub, action, extra }: {
    mark: string
    tone: 'ok' | 'in' | 'wa'
    title: string
    sub: ReactNode
    action?: ReactNode
    extra?: ReactNode
}) {
    return (
        <div className="card">
            <div className="cbody" style={{ textAlign: 'center', padding: '34px 26px' }}>
                <div className={`bigmk ${tone}`}>{mark}</div>
                <h1 className="onbt">{title}</h1>
                <div className="onbs">{sub}</div>
                {action}
                {extra}
            </div>
        </div>
    )
}
