/**
 * 设置。三端共用同一个页面，挂在各自的路由下。
 *
 * ★ 主题切换用的是两张配色缩略图而不是一个开关：
 *   「浅色 / 深色」四个字说不清左边那条深色导航栏在两套主题下都是深的。
 */

import { useNavigate } from 'react-router-dom'
import { Card, CardBody, CardFoot, CardHead, Hello, Kv, KvRow, Page } from '../components/ui'
import { useMock } from '../mock/MockProvider'
import { currentCompany, currentUser, logout } from '../mock/actions'

export function SettingsPage() {
    const { state, act, theme, setTheme, reset } = useMock()
    const navigate = useNavigate()
    const user = currentUser(state)
    const company = currentCompany(state)

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
                    <Kv>
                        <KvRow k="姓名" v={user?.name} sans />
                        <KvRow k="邮箱" v={user?.mail} />
                        <KvRow k="所属企业" v={company?.name} sans />
                    </Kv>
                </CardBody>
                <CardFoot right={
                    <button className="btn" type="button"
                        onClick={() => { act(logout); navigate('/auth/signin') }}>
                        退出登录
                    </button>
                } />
            </Card>

            {/* ★ 演示专用，不是产品功能。接上真后端时连同 mock/ 一起删掉。 */}
            <Card style={{ maxWidth: 640, marginTop: 18 }}>
                <CardHead title="演示数据" />
                <CardBody>
                    <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.65 }}>
                        当前所有数据都在浏览器里（sessionStorage），后端尚未接入。
                        重置会清空询价、报价、订单与派单包，回到初始的种子数据。
                    </div>
                </CardBody>
                <CardFoot right={
                    <button className="btn" type="button"
                        onClick={() => { reset(); navigate('/auth/signin') }}>
                        重置演示数据
                    </button>
                } />
            </Card>
        </Page>
    )
}
