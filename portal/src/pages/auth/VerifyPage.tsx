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
            <NoticeCard
                mark="✉" tone="in"
                title="验证你的企业邮箱"
                sub={<>验证邮件已发送至 <strong>{mail}</strong></>}
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
                        没收到？<a href="#">重新发送</a> · <Link to="/auth/register">换个邮箱</Link>
                    </div>
                }
            />
        </OnboardShell>
    )
}
