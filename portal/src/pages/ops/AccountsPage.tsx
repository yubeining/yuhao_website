/**
 * 账号管理（运营端）。
 *
 * 三块：外部用户（客户 / 供应商联系人）、组织（公司）、运营账号。
 * 各自在 ./accounts/ 下一个文件；共用的列表逻辑在 ./accounts/shared.tsx（2026-11-17 拆分）。
 *
 * ★ 「删除」= 禁用（status=DISABLED）。数据不会消失 —— 账号上挂着订单、报价、图纸，
 *   物理删会留下孤儿数据。界面上是「禁用 / 启用」两个按钮，数据上是同一个状态字段。
 * ★ 邮箱与所属公司不可改；组织类型不可改 —— 合同、权限都按这两样判定。
 *
 * ★ 2026-11-15 改：
 *   - 新建 / 编辑走居中弹框（2026-11-15 统一：只读 → 编辑 → 弹框 → 取消/保存），不再插进列表中间；
 *   - 不再「代建外部用户」—— 客户/供应商都自助注册，运营只改姓名、禁用/启用；
 *   - 三个子页都接统一分页（每页 20 条），搜索栏对齐、回车可查。
 * ★ 文案全部走 t.ops.accounts（scripts/check-i18n-literals.py 是只减不增的棘轮）。
 */

import { useLocation } from 'react-router-dom'
import { Hello, Page } from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { OrgsTab } from './accounts/OrgsTab'
import { StaffTab } from './accounts/StaffTab'
import { UsersTab } from './accounts/UsersTab'

type Tab = 'users' | 'orgs' | 'staff'

export function OpsAccountsPage() {
    const { t } = useMock()
    const a = t.ops.accounts
    // tab 来自 URL：/ops/accounts/users|orgs|staff —— 可收藏、可分享、刷新不丢
    const { pathname } = useLocation()
    const tab: Tab = pathname.endsWith('/orgs') ? 'orgs' : pathname.endsWith('/staff') ? 'staff' : 'users'
    return (
        <Page>
            <Hello title={a.title} />
            {tab === 'users' && <UsersTab />}
            {tab === 'orgs' && <OrgsTab />}
            {tab === 'staff' && <StaffTab />}
        </Page>
    )
}
