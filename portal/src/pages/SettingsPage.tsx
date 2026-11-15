/**
 * 设置。三端共用同一个页面，挂在各自的路由下。
 *
 * ★ 主题切换用的是两张配色缩略图而不是一个开关：
 *   「{t.misc.light} / {t.misc.dark}」四个字说不清左边那条{t.misc.dark}导航栏在两套主题下都是深的。
 */

import { Card, CardBody, CardHead, Hello, Page } from '../components/ui'
import { useMock } from '../mock/MockProvider'

export function SettingsPage() {
    const { theme, setTheme, t } = useMock()

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

        </Page>
    )
}
