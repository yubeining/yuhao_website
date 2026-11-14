/**
 * 国家 / 地区下拉。值是 ISO 两位代码（见 i18n/countries.ts），显示名跟当前语言走。
 *
 * ★ 排序按显示名，不按代码：中文界面下 DE 会排在「德国」，代码序会把「奥地利」排到最后。
 * ★ 空值 = 没选；`OTHER` = 列表里没有、提交前转成 null（库里不存这个值）。
 */

import { useMemo, type CSSProperties } from 'react'
import { useI18n } from '../i18n/I18nProvider'
import { COUNTRY_CODES, OTHER_COUNTRY, countryName } from '../i18n/countries'

export function CountrySelect({ value, onChange, style }: {
    value: string
    onChange: (v: string) => void
    style?: CSSProperties
}) {
    const { lang, t } = useI18n()

    const options = useMemo(
        () => COUNTRY_CODES
            .map((code) => ({ code, label: countryName(code, lang) }))
            .sort((a, b) => a.label.localeCompare(b.label, lang === 'zh' ? 'zh-CN' : 'en')),
        [lang],
    )

    return (
        <select className="inp" value={value} style={style} onChange={(e) => onChange(e.target.value)}>
            <option value="">—</option>
            {options.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
            <option value={OTHER_COUNTRY}>{t.reg.otherCountry}</option>
        </select>
    )
}
