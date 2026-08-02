import { publicRequest } from './core/http'
import type { PartyType } from '../auth/session'

/**
 * 登录相关接口。
 *
 * ★ 目前只有开发用的 dev-login —— 真正的三端登录还没做：
 *     客户端    邮箱 + 密码，自助注册后人工审核
 *     供应商端  手机号 + 验证码，邀请制开户
 *     内部后台  企微扫码 / 邮箱密码
 *
 *   三种登录方式的响应形状应当一致（都返回下面这个 DevLoginResponse 的形状），
 *   这样前端的登录后处理只有一份。
 */

export interface LoginResponse {
    accessToken: string
    partyType: PartyType
    displayName: string
    locale: string
}

/**
 * ★★ 仅开发环境可用。后端默认关闭（app.auth.dev-login.enabled=false），
 *    关闭时这个接口根本不存在，调用返回 404。
 *
 *    生产环境启用它 = 任何人都能给自己签一个 OPERATOR token。
 *    做真实登录时【连同后端的 DevAuthController 一起删掉】，不要留着"以防万一"。
 */
export function devLogin(partyType: PartyType): Promise<LoginResponse> {
    return publicRequest<LoginResponse>('/auth/dev-login', {
        method: 'POST',
        body: { partyType },
    })
}
