/**
 * 设置。三端共用同一个页面，挂在各自的路由下。
 *
 * ★ 主题切换用的是两张配色缩略图而不是一个开关：
 *   「{t.misc.light} / {t.misc.dark}」四个字说不清左边那条{t.misc.dark}导航栏在两套主题下都是深的。
 */

import { useNavigate } from 'react-router-dom'
import { Card, CardBody, CardFoot, CardHead, Hello, Kv, KvRow, Page } from '../components/ui'
import { useMock } from '../mock/MockProvider'
import { logout } from '../mock/actions'
import { clearSession } from '../auth/session'
import { useSession } from '../auth/useSession'
import { logout as apiLogout } from '../services/auth'

/**
 * 身份标签。文案复用 t.nav.* —— 顶栏和设置页显示同一件事，
 * 各自写一份早晚会出现两种说法。
 */
const PARTY_BY_TYPE = (t: ReturnType<typeof useMock>['t']) => ({
    CUSTOMER: t.roles.customer,
    SUPPLIER: t.roles.supplier,
    OPERATOR: t.nav.ops.internalOps,
}) as const

export function SettingsPage() {
    const { act, theme, setTheme, t } = useMock()
    const navigate = useNavigate()
    const session = useSession()

    // ★ 和顶栏用户菜单的退出同一套：撤销后端 refresh token + 清本地登录态。
    //   以前这里只清原型数据仓，真实登录态还在，点了「退出」其实没退出。
    const signOut = () => {
        if (session?.refreshToken) {
            void apiLogout(session.refreshToken).catch(() => undefined)
        }
        clearSession()
        act(logout)
        navigate('/auth/signin', { replace: true })
    }

    return (
        <Page>
            <Hello title={t.misc.settings} />

            <Card style={{ maxWidth: 640 }}>
                <CardHead title={t.misc.appearance} />
                <CardBody>
                    <div className="optrow">
                        <button className={`opt ${theme === 'light' ? 'on' : ''}`} type="button"
                            onClick={() => setTheme('light')}>
                            <span className="sw"><i className="l" /><i className="r" /></span>
                            <span className="on1"><span className="rd" />{t.misc.light}</span>
                        </button>
                        <button className={`opt ${theme === 'dark' ? 'on' : ''}`} type="button"
                            onClick={() => setTheme('dark')}>
                            <span className="sw dk"><i className="l" /><i className="r" /></span>
                            <span className="on1"><span className="rd" />{t.misc.dark}</span>
                        </button>
                    </div>
                </CardBody>
            </Card>

            <Card style={{ maxWidth: 640, marginTop: 18 }}>
                <CardHead title={t.misc.account} />
                <CardBody>
                    {/* 只显示登录态里真有的字段；邮箱、企业名登录态里没有，不显示 */}
                    <Kv>
                        <KvRow k={t.misc.name} v={session?.displayName} sans />
                        <KvRow k={t.misc.role} v={session ? PARTY_BY_TYPE(t)[session.partyType] : undefined} sans />
                    </Kv>
                </CardBody>
                <CardFoot right={
                    <button className="btn" type="button" onClick={signOut}>
                        {t.nav.signOut}
                    </button>
                } />
            </Card>

        </Page>
    )
}
