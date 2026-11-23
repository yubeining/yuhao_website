import { http, publicRequest } from './core/http'
import type { PartyType } from '../auth/session'

/**
 * 认证接口 —— 对接真后端(§ mock→real 迁移的第一块)。
 *
 * 内外两条独立入口(和后端一致,页面不混):
 *   外部(客户/供应商)  /auth/login          只凭账号+密码,受众由后端按账号所属组织推出
 *   内部(运营)         /auth/internal/login  恒 OPERATOR
 * 注册只对外部:/auth/register/otp(邮箱验证码,建组织 + 首个用户并直接签发登录态)。
*/

export interface TokenResponse {
    accessToken: string
    refreshToken: string
    portalType: PartyType
    displayName: string
    locale: string | null
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
/**
 * 邮箱验证码注册（2026-11-14）：校验并消费验证码、建号、直接返回登录态。
 *
 * 建出来的账号没有密码 —— 以后只能用验证码登录。显示名是邮箱前缀（后端生成）。
 */
export function registerWithCode(email: string, code: string, orgName?: string): Promise<TokenResponse> {
    return publicRequest<TokenResponse>('/auth/register/otp', {
        method: 'POST',
        body: { email, code, orgName },
    })
}

/** 登出:撤销 refresh token(幂等)。 */
export function logout(refreshToken: string): Promise<void> {
    return publicRequest<void>('/auth/logout', {
        method: 'POST',
        body: { refreshToken },
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
const PROFILE_PATH: Record<PartyType, string> = {
    CUSTOMER: '/customer/me/profile',
    SUPPLIER: '/supplier/me/profile',
    OPERATOR: '/ops/me/profile',
}

/** 个人资料：邮箱 / 昵称 / 身份 / 注册时间。身份由后端按组织类型给出。 */
export interface MyProfile {
    email: string
    nickname: string
    partyType: PartyType
    createdAt: string
}

export function getMyProfile(partyType: PartyType): Promise<MyProfile> {
    return http.get<MyProfile>(PROFILE_PATH[partyType])
}

/** 改自己的昵称。 */
export function updateMyNickname(partyType: PartyType, nickname: string): Promise<void> {
    return http.patch<void>(PROFILE_PATH[partyType], { nickname })
}

const LOCALE_PATH: Record<PartyType, string> = {
    CUSTOMER: '/customer/me/locale',
    SUPPLIER: '/supplier/me/locale',
    OPERATOR: '/ops/me/locale',
}

export function updateMyLocale(partyType: PartyType, locale: string): Promise<void> {
    return http.patch<void>(LOCALE_PATH[partyType], { locale })
}

// ---------- 改密码 / 忘记密码（2026-11-23） ----------

/**
 * 忘记密码第一步：申请邮件验证码。只给客户 / 供应商（运营登录页不加忘记密码）。
 *
 * ★ 响应对任何邮箱都一样 —— 页面不能据此说"已发送到你的邮箱"，只能说"如果已注册会收到"。
 */
export function forgotPassword(email: string): Promise<{ sent: boolean }> {
    return publicRequest<{ sent: boolean }>('/auth/password/forgot', {
        method: 'POST',
        body: { email },
    })
}

/** 忘记密码第二步：凭码设新密码。成功直接返回登录态（需求方 2026-11-23：重置后直接登录）。 */
export function resetPassword(email: string, code: string, newPassword: string): Promise<TokenResponse> {
    return publicRequest<TokenResponse>('/auth/password/reset', {
        method: 'POST',
        body: { email, code, newPassword },
    })
}

const PASSWORD_PATH: Record<PartyType, string> = {
    CUSTOMER: '/customer/me/password',
    SUPPLIER: '/supplier/me/password',
    OPERATOR: '/ops/me/password',
}

/** 已登录改密码第一步：向本人账号邮箱发验证码。 */
export function sendMyPasswordCode(partyType: PartyType): Promise<{ sent: boolean }> {
    return http.post<{ sent: boolean }>(`${PASSWORD_PATH[partyType]}/code`)
}

/** 已登录改密码第二步。成功后所有设备（含当前）都已退出，调用方要清登录态。 */
export function changeMyPassword(partyType: PartyType, code: string, newPassword: string): Promise<void> {
    return http.put<void>(PASSWORD_PATH[partyType], { code, newPassword })
}
