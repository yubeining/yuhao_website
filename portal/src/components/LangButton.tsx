/**
 * 中 / EN 切换。
 *
 * ★ 走 useI18n 而不是 useMock：语言不再是原型数据的一部分，
 *   它按「人」判定（账号 > 浏览器），手动点过就永久覆盖。
 *
 * ★ 现在只出现在登录/注册页。登录之后要放哪里（顶栏 / 设置页）还没定 ——
 *   定之前不要凭空加按钮。
 */

import { useI18n } from '../i18n/I18nProvider'

export function LangButton() {
    const { lang, toggleLang } = useI18n()
    return (
        // i18n-exempt-start: 语言名用其自身语言显示（endonym），不随界面语言变化
        <button className="langbtn" type="button"
            title={lang === 'zh' ? 'Switch to English' : '切换为中文'}
            onClick={toggleLang}>
            {lang === 'zh' ? '中' : 'EN'}
        </button>
        // i18n-exempt-end
    )
}
