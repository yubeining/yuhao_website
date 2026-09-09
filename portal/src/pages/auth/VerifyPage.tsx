/**
 * 邮箱验证。原型里点一下就算验过 —— 真实实现是邮件里的一次性链接。
 */

import { Link, useNavigate } from 'react-router-dom'
import { StepBar } from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { verifyMail } from '../../mock/actions'
import { NoticeCard, OnboardShell } from './OnboardShell'

export function VerifyPage() {
    const { state, act } = useMock()
    const navigate = useNavigate()
    const mail = state.session.pendingMail || ''

    return (
        <OnboardShell slim right={<Link className="btn sm qui" to="/auth/signin">返回登录</Link>}>
            <StepBar names={['填写信息', '验证邮箱', '开始询价']} cur={1} />
            {/* ★ 这里原本写「验证邮件已发送至 xxx」。没有任何邮件被发出去 ——
                notification 包还没接线。用户会去等一封不存在的邮件，
                等不到之后只会以为是自己的邮箱出了问题。改成如实说明。 */}
            <NoticeCard
                mark="✉" tone="in"
                title="验证你的企业邮箱"
                sub={<>邮箱 <strong>{mail}</strong> —— <b>邮件发送功能尚未接入，暂不会收到验证邮件</b></>}
                action={
                    <button className="btn pri" type="button" style={{ padding: '11px 26px' }}
                        onClick={() => {
                            act(verifyMail)
                            navigate('/auth/signin')
                        }}>
                        我已完成验证
                    </button>
                }
                extra={
                    <div style={{ marginTop: 16, fontSize: 12.5, color: 'var(--muted)' }}>
                        {/* ★「重新发送」已删：href="#"，而且根本没有第一封可重发。 */}
                        <Link to="/auth/register">换个邮箱</Link>
                    </div>
                }
            />
        </OnboardShell>
    )
}
