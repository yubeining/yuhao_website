/**
 * 表单控件。
 *
 * ★ 全部是受控组件，值由调用页面的 useState 持有。
 *   原型靠一个全局 F 缓冲 + 全量重渲染，在 React 里那样做会让每次按键
 *   重画整棵树；这里改成每个表单自己管自己的值。
 */

import { useI18n } from '../i18n/I18nProvider'
import type { CSSProperties, ReactNode } from 'react'

export function Input({ value, onChange, onBlur, placeholder, type = 'text', bad, disabled, style, id, autoComplete }: {
    value: string
    onChange: (v: string) => void
    /** 离开输入框时触发（比如失焦保存、失焦查询） */
    onBlur?: () => void
    placeholder?: string
    type?: string
    /** 校验不过时描红 */
    bad?: boolean
    /** 只读展示（置灰、不可编辑）。用于「不能改但要看得到」的字段。 */
    disabled?: boolean
    style?: CSSProperties
    id?: string
    autoComplete?: string
}) {
    return (
        <input
            className={`inp${bad ? ' bad' : ''}`}
            type={type}
            id={id}
            autoComplete={autoComplete}
            placeholder={placeholder}
            value={value}
            style={style}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
        />
    )
}

export function Select({ value, onChange, options, style }: {
    value: string
    onChange: (v: string) => void
    options: string[]
    style?: CSSProperties
}) {
    return (
        <select className="inp" value={value} style={style} onChange={(e) => onChange(e.target.value)}>
            {options.map((o) => <option key={o} value={o}>{o || '—'}</option>)}
        </select>
    )
}

/** 带标签的字段。登录、注册、入驻向导都用它。 */
export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
    return (
        <div className="field2">
            <label>{label}</label>
            {children}
        </div>
    )
}

/**
 * 并排的字段行。默认两列，cols=3 时自适应铺三列。窄屏由 CSS 收成一列。
 */
export function FieldRow({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 }) {
    return <div className={cols === 3 ? 'f3row' : 'f2row'}>{children}</div>
}

/** 表单级错误。永远显示在提交按钮上方 —— 提交失败时视线就在那里。 */
export function ErrMsg({ children }: { children: ReactNode }) {
    return children ? <div className="errmsg">{children}</div> : null
}

export function BigButton({ children, onClick, type = 'button' }: {
    children: ReactNode
    onClick?: () => void
    type?: 'button' | 'submit'
}) {
    return <button className="bigbtn" type={type} onClick={onClick}>{children}</button>
}

export function Checkbox({ checked, onChange, children }: {
    checked: boolean
    onChange: (v: boolean) => void
    children: ReactNode
}) {
    return (
        <label>
            <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
            {' '}{children}
        </label>
    )
}

/** 上传占位。原型里没有真实上传 —— 直传对象存储要等后端签发 URL。 */
export function UploadDrop({ title, hint }: { title: string; hint: string }) {
    return (
        <div className="updrop">
            <div className="u1">↑ {title}</div>
            <div className="u2">{hint}</div>
        </div>
    )
}

/**
 * 数量输入。手填、框选、点 ± 三种都能用。
 *
 * ★ 中间就是一个普通输入框 —— 能整段框选替换。填几十个零件时，
 *   双击选中直接敲新数字比点二十下加号快得多，两种都要留着。
 *
 * ★ 不给 0：数量为 0 的零件不该存在于订单里，要么填数要么删掉这一行。
 */
export function Stepper({ value, onChange, min = 1, max, placeholder, width = 132, disabled }: {
    value: string
    onChange: (v: string) => void
    min?: number
    max?: number
    placeholder?: string
    width?: number
    disabled?: boolean
}) {
    const { t } = useI18n()
    const n = parseInt(String(value).replace(/[^\d-]/g, ''), 10)
    const cur = Number.isFinite(n) ? n : null

    const step = (d: number) => {
        const base = cur ?? min - d          // 空着时点 + 得到 min，点 − 也得到 min
        let next = base + d
        if (next < min) next = min
        if (max !== undefined && next > max) next = max
        onChange(String(next))
    }

    return (
        <div className="stepper" style={{ width }}>
            <button type="button" className="st-btn" onClick={() => step(-1)}
                disabled={disabled || (cur !== null && cur <= min)} aria-label={t.common.decrease}>−</button>
            <input
                className="st-in"
                inputMode="numeric"
                placeholder={placeholder ?? t.common.unitPieces}
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ''))}
            />
            <button type="button" className="st-btn" onClick={() => step(1)}
                disabled={disabled || (max !== undefined && cur !== null && cur >= max)} aria-label={t.common.increase}>＋</button>
        </div>
    )
}
