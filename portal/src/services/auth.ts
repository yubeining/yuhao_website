import { http, publicRequest } from './core/http'
import type { PartyType } from '../auth/session'

/**
 * 认证接口 —— 对接真后端(§ mock→real 迁移的第一块)。
 *
 * 内外两条独立入口(和后端一致,页面不混):
 *   外部(客户/供应商)  /auth/login          只凭账号+密码,受众由后端按账号所属组织推出
 *   内部(运营)         /auth/internal/login  恒 OPERATOR
 * 注册只对外部:/auth/register(建组织 + 首个用户)。
 */

export interface TokenResponse {
    accessToken: string
    refreshToken: string
    portalType: PartyType
    displayName: string
    locale: string
}

export interface RegisterInput {
    portalType: 'CUSTOMER' | 'SUPPLIER'
    /**
     * 可选。注册阶段不再要求公司名（docs/design/14 §4）——
     * 后端会建一个没名字的公司，提交订单前由客户在「设置 → 公司信息」补。
     */
    orgName?: string
    country?: string
    email: string
    password: string
    displayName: string
}

export interface UserView {
    id: string
    orgId: string
    email: string
    displayName: string
    status: string
    locale: string | null
}

/** 外部登录:账号 + 密码。 */
export function externalLogin(account: string, password: string): Promise<TokenResponse> {
    return publicRequest<TokenResponse>('/auth/login', {
        method: 'POST',
        body: { account, password },
    })
}

/** 内部(运营)登录:独立入口。 */
export function opsLogin(account: string, password: string): Promise<TokenResponse> {
    return publicRequest<TokenResponse>('/auth/internal/login', {
        method: 'POST',
        body: { account, password },
    })
}

/** 外部自助注册:建公司 + 首个用户。 */
export function register(input: RegisterInput): Promise<UserView> {
    return publicRequest<UserView>('/auth/register', {
        method: 'POST',
        body: input,
    })
}

/** 登出:撤销 refresh token(幂等)。 */
export function logout(refreshToken: string): Promise<void> {
    return publicRequest<void>('/auth/logout', {
        method: 'POST',
        body: { refreshToken },
    })
}

/** 凭邀请链接查到的邀请：注册页预填用。无效（不存在 / 过期 / 用过 / 作废）→ 410 auth.invite_invalid。 */
export interface SupplierInviteCheck {
    orgName: string
    email: string
    expiresAt: string
}

export function checkSupplierInvite(token: string): Promise<SupplierInviteCheck> {
    return publicRequest<SupplierInviteCheck>(`/auth/supplier-invites/${encodeURIComponent(token)}`)
}

/** 凭邀请注册供应商账号。邮箱就是邀请上的那个，不收。 */
export function registerWithSupplierInvite(
    token: string, input: { orgName: string; displayName: string; password: string },
): Promise<UserView> {
    return publicRequest<UserView>(`/auth/supplier-invites/${encodeURIComponent(token)}/register`, {
        method: 'POST',
        body: input,
    })
}

// ---------- 验证码登录（邮箱）----------

export type OtpChannel = 'EMAIL' | 'SMS'

/**
 * 校验结果。
 *
 * `registrationRequired=true` 表示「邮箱已验证，但这个邮箱还没有账号」——
 * 后端**不签发登录态**。此时前端应该引导去注册，而不是当登录成功。
 */
export interface OtpVerifyResult {
    registrationRequired: boolean
    token?: TokenResponse
}

/**
 * 发码。响应里没有"这个邮箱是否存在" —— 服务端刻意不区分（防账号枚举）。
 *
 * 目前只有 EMAIL 通道可用；SMS 会被后端以 `auth.otp_channel_unavailable` 拒绝。
 */
export function sendOtp(channel: OtpChannel, identifier: string): Promise<{ sent: boolean }> {
    return publicRequest<{ sent: boolean }>('/auth/otp/send', {
        method: 'POST',
        body: { channel, identifier },
    })
}

/** 校验并登录。成功时 `token` 与密码登录的响应同形。 */
export function verifyOtp(channel: OtpChannel, identifier: string, code: string): Promise<OtpVerifyResult> {
    return publicRequest<OtpVerifyResult>('/auth/otp/verify', {
        method: 'POST',
        body: { channel, identifier, code },
    })
}

// ---------- 语言偏好 ----------

/**
 * 把自己的语言偏好写回账号 —— 换设备、换浏览器也跟着走。
 *
 * ★ 按端分路径（{@code /customer} / {@code /supplier} / {@code /ops} 各一份）：
 *   路径前缀即受众，写成一个通用的 {@code /me/locale} 就成了三端公共入口。
 *
 * ★ 运营端曾经漏了这一支：非 SUPPLIER 一律打到 {@code /customer/me/locale}，
 *   而运营 principal 打客户端的路径会被端级闸门拦成 403 —— 运营在后台切语言
 *   看起来切了，实际一次都没存下来（2026-11-12 E2E 抓到的）。
 *
 * ★ 失败不抛给调用方 —— 存语言失败不该让人用不了页面。
 */
const LOCALE_PATH: Record<PartyType, string> = {
    CUSTOMER: '/customer/me/locale',
    SUPPLIER: '/supplier/me/locale',
    OPERATOR: '/ops/me/locale',
}

export function updateMyLocale(partyType: PartyType, locale: string): Promise<void> {
    return http.patch<void>(LOCALE_PATH[partyType], { locale })
}
