import { Link } from 'react-router-dom'
import { NoticeCard, OnboardShell } from './auth/OnboardShell'
import { useI18n } from '../i18n/I18nProvider'

export function NotFoundPage() {
    const { t } = useI18n()
    return (
        <OnboardShell slim>
            <NoticeCard
                mark="?" tone="wa"
                title={t.misc.notFoundTitle}
                sub={t.misc.notFoundSub}
                action={<Link className="btn pri" to="/" style={{ padding: '11px 26px' }}>{t.misc.backHome}</Link>}
            />
        </OnboardShell>
    )
}
