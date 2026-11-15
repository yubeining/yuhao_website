/**
 * 补公司名称的单字段弹层。
 *
 * ★ 为什么要有它：公司名是提交订单的前置条件，但注册时没填的用户会被拦在订单页。
 *   让他跳去「设置」再跳回来会丢上下文，所以就地补 —— 一个字段、一次保存。
 * ★ 设置页里也有同一件事的入口（Company 卡片），两者调同一个接口。
 */

import { useState } from 'react'
import { useMock } from '../mock/MockProvider'
import { errorText } from '../i18n/errorText'
import { renameMyOrganization } from '../services/customer/organization'
import { Banner } from './ui'
import { Field, Input } from './form'

export function CompanyNameModal({ onClose, onSaved }: {
    onClose: () => void
    onSaved: (name: string) => void
}) {
    const { t } = useMock()
    const [name, setName] = useState('')
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)

    const save = async () => {
        if (!name.trim()) {
            setErr(t.misc.companyNameHint)
            return
        }
        setBusy(true)
        setErr(null)
        try {
            const org = await renameMyOrganization(name.trim())
            onSaved(org.name ?? name.trim())
        } catch (e) {
            setErr(errorText(t, e, t.common.actionFailed))
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="fp-overlay" onClick={onClose}>
            <div className="cnm" onClick={(e) => e.stopPropagation()}>
                <div className="cnm-h">{t.misc.companyName}</div>
                <div className="cnm-b">
                    <Field label={t.misc.companyName} required>
                        <Input value={name} onChange={(v) => { setName(v); setErr(null) }} />
                    </Field>
                    <div className="fnote" style={{ marginTop: 6 }}>{t.misc.companyNameHint}</div>
                    {err && <Banner tone="wa" style={{ marginTop: 10 }}>{err}</Banner>}
                </div>
                <div className="cnm-f">
                    <button className="btn" type="button" onClick={onClose}>{t.common.cancel}</button>
                    <button className="btn pri" type="button" disabled={busy} onClick={() => void save()}>
                        {busy ? '…' : t.common.save}
                    </button>
                </div>
            </div>
        </div>
    )
}
