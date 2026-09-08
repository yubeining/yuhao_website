import { publicRequest } from './core/http'
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
    orgName: string
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
