import { Link } from 'react-router-dom'
import { NoticeCard, OnboardShell } from './auth/OnboardShell'

export function NotFoundPage() {
    return (
        <OnboardShell slim>
            <NoticeCard
                mark="?" tone="wa"
                title="这个地址没有对应的页面"
                sub="链接可能已经失效，或者你没有访问这个页面的身份。"
                action={<Link className="btn pri" to="/" style={{ padding: '11px 26px' }}>回首页</Link>}
            />
        </OnboardShell>
    )
}
