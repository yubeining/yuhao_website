/**
 * 中 / EN 切换。只出现在登录与注册页 —— 那是欧洲客户唯一会遇到语言问题的地方，
 * 进了应用之后语种由账号决定，不再让用户操心。
 */

import { useMock } from '../mock/MockProvider'

export function LangButton() {
    const { lang, setLang } = useMock()
    return (
        <button className="langbtn" type="button"
            title={lang === 'zh' ? 'Switch to English' : '切换为中文'}
            onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
            {lang === 'zh' ? '中' : 'EN'}
        </button>
    )
}
