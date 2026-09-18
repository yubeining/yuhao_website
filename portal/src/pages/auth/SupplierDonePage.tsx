/**
 * 入驻提交完成。
 *
 * ★ 这一页存在的唯一目的是把「能登录 ≠ 能抢单」讲清楚。
 *   不讲的话，供应商登进去看见满屏派单包却点不动抢单按钮，会当成 bug 来问。
 */

import { PrototypeBanner } from '../../components/ui'
import { useNavigate } from 'react-router-dom'
import { NoticeCard, OnboardShell } from './OnboardShell'

export function SupplierDonePage() {
    const navigate = useNavigate()
    return (
        <OnboardShell slim>
            <PrototypeBanner />
            <NoticeCard
                mark="◷" tone="wa"
                title="已提交，等待资质考察"
                sub={
                    <>
                        你现在可以登录浏览订单市场，<strong>但还不能抢单</strong>。<br />
                        考察通过并定级后会通知你。
                    </>
                }
                action={
                    <button className="btn pri" type="button" style={{ padding: '11px 26px' }}
                        onClick={() => navigate('/auth/signin')}>
                        去登录
                    </button>
                }
            />
        </OnboardShell>
    )
}
