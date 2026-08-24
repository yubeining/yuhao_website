/**
 * 供应商邀请落地页。
 *
 * ★ 供应商是邀请制 —— 没有有效邀请就没有入驻入口。
 *   这一页要把这件事说清楚，而不是给个注册表单让人填完才发现进不来。
 */

import { Link, useNavigate } from 'react-router-dom'
import { useMock } from '../../mock/MockProvider'
import { X } from '../../mock/format'
import { NoticeCard, OnboardShell } from './OnboardShell'

export function InvitePage() {
    const { state } = useMock()
    const navigate = useNavigate()
    const invite = state.db.invites.find((i) => !i.used)

    return (
        <OnboardShell slim right={<Link className="btn sm qui" to="/auth/signin">返回登录</Link>}>
            {invite ? (
                <NoticeCard
                    mark="⊕" tone="ok"
                    title="你收到一份供应商邀请"
                    sub={
                        <>
                            融一智造邀请 <strong>{invite.name || X}</strong> 成为平台供应商。<br />
                            本链接一次性使用。
                        </>
                    }
                    action={
                        <button className="btn pri" type="button" style={{ padding: '11px 30px' }}
                            onClick={() => navigate('/auth/supplier-register')}>
                            开始入驻
                        </button>
                    }
                />
            ) : (
                <NoticeCard
                    mark="!" tone="wa"
                    title="没有有效的邀请"
                    sub="平台供应商为邀请制。请联系融一智造获取邀请链接。"
                    action={<Link className="btn" to="/auth/signin">返回登录</Link>}
                />
            )}
        </OnboardShell>
    )
}
