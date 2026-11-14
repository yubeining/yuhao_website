/**
 * 新建订单。
 *
 * ★ 独立路由而不是订单列表里的内联表单：任何地方点「新建订单」都直接到这里，
 *   不再先跳列表、再点一次。少一次请求，也少一次犹豫。
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Banner, Card, CardBody, CardFoot, Hello, Page } from '../../components/ui'
import { Input } from '../../components/form'
import { useMock } from '../../mock/MockProvider'
import { createOrder } from '../../services'
import { errorText } from '../../i18n/errorText'

export function NewOrderPage() {
    const { t } = useMock()
    const navigate = useNavigate()
    const [title, setTitle] = useState('')
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)

    const create = async () => {
        if (busy) return
        setBusy(true)
        setErr(null)
        try {
            const order = await createOrder({ title: title.trim() || null, wantedLeadDays: null })
            // 建完直接进详情，接着录零件/传图纸
            navigate(`/customer/orders/${order.id}`, { replace: true })
        } catch (e) {
            setErr(errorText(t, e))
        } finally {
            setBusy(false)
        }
    }

    return (
        <Page>
            <Hello title={t.customer.orders.newTitle} />
            {err && <Banner tone="wa" style={{ marginBottom: 14 }}>{err}</Banner>}

            <Card style={{ maxWidth: 640 }}>
                <CardBody>
                    <Input value={title} placeholder={t.customer.orders.titlePlaceholder}
                        onChange={(v) => { setTitle(v); setErr(null) }} />
                </CardBody>
                <CardFoot
                    left={<button className="btn" type="button" onClick={() => navigate(-1)}>{t.common.cancel}</button>}
                    right={
                        <button className="btn pri" type="button" disabled={busy} onClick={() => void create()}>
                            {busy ? '…' : t.common.create}
                        </button>
                    }
                />
            </Card>
        </Page>
    )
}
