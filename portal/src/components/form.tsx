/**
 * 表单控件。
 *
 * ★ 全部是受控组件，值由调用页面的 useState 持有。
 *   原型靠一个全局 F 缓冲 + 全量重渲染，在 React 里那样做会让每次按键
 *   重画整棵树；这里改成每个表单自己管自己的值。
 */

import type { CSSProperties, ReactNode } from 'react'

export function Input({ value, onChange, placeholder, type = 'text', bad, style, id, autoComplete }: {
    value: string
    onChange: (v: string) => void
    placeholder?: string
    type?: string
    /** 校验不过时描红 */
    bad?: boolean
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
            onChange={(e) => onChange(e.target.value)}
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

/** 两列并排的字段行。窄屏由 CSS 收成一列。 */
export function FieldRow({ children }: { children: ReactNode }) {
    return <div className="f2row">{children}</div>
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
