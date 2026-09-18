/**
 * 设置。三端共用同一个页面，挂在各自的路由下。
 *
 * ★ 主题切换用的是两张配色缩略图而不是一个开关：
 *   「浅色 / 深色」四个字说不清左边那条深色导航栏在两套主题下都是深的。
 */

import { useNavigate } from 'react-router-dom'
import { Card, CardBody, CardFoot, CardHead, Hello, Kv, KvRow, Page } from '../components/ui'
import { useMock } from '../mock/MockProvider'
import { logout } from '../mock/actions'
import { clearSession } from '../auth/session'
import { useSession } from '../auth/useSession'
import { logout as apiLogout } from '../services/auth'

const PARTY_LABEL = { CUSTOMER: '客户', SUPPLIER: '供应商', OPERATOR: '内部 · 运营' } as const

export function SettingsPage() {
    const { act, theme, setTheme } = useMock()
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
            <Hello title="设置" />

            <Card style={{ maxWidth: 640 }}>
                <CardHead title="外观" />
                <CardBody>
                    <div className="optrow">
                        <button className={`opt ${theme === 'light' ? 'on' : ''}`} type="button"
                            onClick={() => setTheme('light')}>
                            <span className="sw"><i className="l" /><i className="r" /></span>
                            <span className="on1"><span className="rd" />浅色</span>
                        </button>
                        <button className={`opt ${theme === 'dark' ? 'on' : ''}`} type="button"
                            onClick={() => setTheme('dark')}>
                            <span className="sw dk"><i className="l" /><i className="r" /></span>
                            <span className="on1"><span className="rd" />深色</span>
                        </button>
                    </div>
                </CardBody>
            </Card>

            <Card style={{ maxWidth: 640, marginTop: 18 }}>
                <CardHead title="账号" />
                <CardBody>
                    {/* 只显示登录态里真有的字段；邮箱、企业名登录态里没有，不显示 */}
                    <Kv>
                        <KvRow k="姓名" v={session?.displayName} sans />
                        <KvRow k="身份" v={session ? PARTY_LABEL[session.partyType] : undefined} sans />
                    </Kv>
                </CardBody>
                <CardFoot right={
                    <button className="btn" type="button" onClick={signOut}>
                        退出登录
                    </button>
                } />
            </Card>

        </Page>
    )
}
