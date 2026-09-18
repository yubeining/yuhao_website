/**
 * 前端唯一的 HTTP 收口。
 *
 * ★ 禁止绕过这个文件（CLAUDE.md §4）：
 *   不要 axios.create()，不要在组件里裸 fetch 内部接口。
 *   认证头、401 处理、错误包装全在这里，绕过就丢掉统一行为。
 *   唯一例外是调外部 API（不同 host），那种情况本来就该单独处理。
 *
 * ★★ 本文件【不做】任何 camelCase ↔ snake_case 转换（CLAUDE.md §11 C1）。
 *
 *   参考系统做了自动转换，为此攒了两组豁免名单，每条都是一次线上 bug：
 *   流程图配置的 actionType 被转成 action_type 导致保存 400、表单配置的
 *   ui.minSelect 被转导致校验静默失效、snake 镜像 key 回写覆盖用户编辑。
 *
 *   我们前后端统一 camelCase。Jackson 默认就是 camelCase，什么都不用配。
 *   数据库列名的 snake_case 由 JPA @Column 映射，转换只发生在那一层。
 *
 *   如果哪天有人提议"加个自动转换会方便点" —— 答案是不。
 */

import { clearSession, getSession, setSession, type Session } from '../../auth/session'

/**
 * ★ 恒为相对路径。
 *
 *   前端是 SPA：生产环境由 Spring Boot 和 API 一起托管（同源），
 *   开发环境由 vite 的 proxy 转发到 :3001（也是同源）。
 *   两个环境的请求形状完全一致 —— 不需要 API_URL 之类的环境变量，
 *   也不需要任何 CORS 配置。
 *
 *   ★ 前缀改了要同步改三处：后端 app.api.prefix、vite.config.ts 的 proxy、这里。
 *     只有这三处允许出现字面量，业务代码里一律不许（CLAUDE.md §11 C5）。
 */
export const API_BASE = '/api/v1'

/** 后端统一响应外壳。message 是 i18n code 而不是文案。 */
interface ApiEnvelope<T> {
    code: number
    message: string
    data: T
}

/**
 * 请求失败时抛出。带上后端的 code 和 data，
 * 调用方可以按状态分支（例如 409 报价已过期时 data 里带当前状态）。
 */
export class ApiError extends Error {
    public readonly code: number
    public readonly messageCode: string
    public readonly data: unknown

    public constructor(messageCode: string, code: number, data?: unknown) {
        super(messageCode)
        this.name = 'ApiError'
        this.code = code
        this.messageCode = messageCode
        this.data = data
    }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
    body?: unknown
    /** 跳过认证头。给公开端点用（官网留资表单、公开报价查看链接） */
    skipAuth?: boolean
}

function authHeader(skipAuth: boolean): Record<string, string> {
    if (skipAuth) return {}
    const token = getSession()?.accessToken
    return token ? { Authorization: `Bearer ${token}` } : {}
}

/**
 * access token 过期（2 小时）后用 refresh token 换一对新的，成功返回 true。
 *
 * ★ 以前没有这一步：access token 一过期就直接登出，用户每 2 小时被踢回登录页
 *   （2026-09-18 线上验证时发现）。refresh token 30 天有效，后端早就有刷新接口。
 *
 * ★ 同一时刻只发一个刷新请求：refresh token 是一次性的（用过即作废、换新），
 *   一个页面同时有几个请求 401，各自去刷的话只有第一个成功，其余拿作废的 token 刷失败就把人登出了。
 * ★ 别的标签页可能已经刷过（本地的 token 已经换了）：那就直接用新的重试，不再刷；
 *   刷新失败时也再看一眼，别的标签页刚刷成功的话同样算成功。
 * ★ 运营走内部入口（/auth/internal/refresh），客户 / 供应商走外部入口 —— 后端拒绝混用。
 */
let refreshing: Promise<boolean> | null = null

async function refreshSession(usedAccessToken: string | undefined): Promise<boolean> {
    const current = getSession()
    if (!current?.refreshToken) return false
    if (usedAccessToken !== undefined && current.accessToken !== usedAccessToken) return true
    if (!refreshing) {
        refreshing = rotate(current).finally(() => { refreshing = null })
    }
    return refreshing
}

async function rotate(session: Session): Promise<boolean> {
    const path = session.partyType === 'OPERATOR' ? '/auth/internal/refresh' : '/auth/refresh'
    try {
        const response = await fetch(`${API_BASE}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: session.refreshToken }),
        })
        const envelope = response.ok ? (await response.json()) as ApiEnvelope<RefreshedTokens> : null
        if (envelope?.code === 200 && envelope.data?.accessToken) {
            setSession({
                ...session,
                accessToken: envelope.data.accessToken,
                refreshToken: envelope.data.refreshToken,
                displayName: envelope.data.displayName,
                locale: envelope.data.locale,
            })
            return true
        }
    } catch {
        // 网络错误：按刷新失败处理
    }
    return getSession()?.refreshToken !== session.refreshToken && getSession() !== null
}

interface RefreshedTokens {
    accessToken: string
    refreshToken: string
    displayName: string
    locale: string
}

/**
 * 发请求；带认证的请求遇到 401 先刷新一次再重发，还是 401 才登出。
 * {@code send} 每次调用都要重新读认证头（刷新之后 token 变了）。
 */
async function withRefresh(send: () => Promise<Response>, skipAuth: boolean): Promise<Response> {
    const usedAccessToken = skipAuth ? undefined : getSession()?.accessToken
    let response = await send()
    if (response.status === 401 && !skipAuth) {
        if (await refreshSession(usedAccessToken)) {
            response = await send()
        }
        if (response.status === 401) {
            forceSignOut()
            throw new ApiError('common.unauthenticated', 401)
        }
    }
    return response
}

/**
 * refresh 也失效（30 天过期、已登出、被撤销）时统一登出。
 *
 * ★ 用 location.replace 而不是 React Router 的 navigate ——
 *   本函数会被 service 层（非组件上下文）调用，那里拿不到 router 实例。
 *
 * ★ replace 而不是 assign：失效的页面不该留在浏览器历史里，
 *   否则用户点「后退」会回到一个注定 401 的页面，再次跳登录，看起来像卡死。
 */
function forceSignOut(): void {
    clearSession()
    if (location.pathname === '/auth/signin') {
        return
    }
    const callbackUrl = encodeURIComponent(location.pathname + location.search)
    location.replace(`/auth/signin?callbackUrl=${callbackUrl}`)
}

/**
 * 内部 API 请求。
 *
 * @throws {ApiError} 非 2xx 或后端 envelope 里 code 非 200 时
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { body, skipAuth = false, headers, ...rest } = options

    // ★ 直接 JSON.stringify，不做任何 key 转换
    const payload = body === undefined ? undefined : JSON.stringify(body)
    // 401 = token 失效：先刷新再重发，刷新不了统一登出，不让每个调用方各自处理
    const response = await withRefresh(() => fetch(`${API_BASE}${path}`, {
        ...rest,
        headers: {
            'Content-Type': 'application/json',
            ...authHeader(skipAuth),
            ...(headers as Record<string, string> | undefined),
        },
        body: payload,
    }), skipAuth)

    // 204 没有响应体
    if (response.status === 204) {
        return undefined as T
    }

    let envelope: ApiEnvelope<T>
    try {
        envelope = (await response.json()) as ApiEnvelope<T>
    } catch {
        throw new ApiError('common.malformed_response', response.status)
    }

    if (!response.ok || envelope.code !== 200) {
        throw new ApiError(
            envelope.message || 'common.internal_error',
            envelope.code || response.status,
            envelope.data,
        )
    }

    return envelope.data
}

/** 公开端点（无 JWT）。 */
export function publicRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return request<T>(path, { ...options, skipAuth: true })
}

/**
 * 二进制下载（图纸、报告、单据）。
 *
 * 注意：大文件应该走后端签发的短期签名 URL 直接从对象存储下载，
 * 不要经过这个函数把几百 MB 的 STEP 文件读进浏览器内存。
 */
export async function requestBinary(path: string, options: RequestOptions = {}): Promise<Blob> {
    // ★ body 必须和 request() 一样从 ...rest 里解构出来再单独处理。
    //   漏掉它，RequestOptions 里 unknown 类型的 body 会直接落进 fetch 的
    //   RequestInit —— TypeScript 报 TS2345，而如果这个文件恰好没被 tsc 覆盖到
    //   （比如只跑 vite build 不跑 tsc），它会一路编译过去，运行时把
    //   一个对象当成 BodyInit 发出去，变成字符串 "[object Object]"。
    const { body, skipAuth = false, headers, ...rest } = options

    const payload = body === undefined ? undefined : JSON.stringify(body)
    const response = await withRefresh(() => fetch(`${API_BASE}${path}`, {
        ...rest,
        headers: {
            ...authHeader(skipAuth),
            ...(headers as Record<string, string> | undefined),
        },
        body: payload,
    }), skipAuth)
    if (!response.ok) {
        throw new ApiError('common.download_failed', response.status)
    }

    return response.blob()
}

/**
 * 把文件直接 PUT 到对象存储的预签名 URL —— 字节不经过我们的后端。
 *
 * ★ 这不是内部 API，所以和上面几个函数处处相反：
 *   - URL 是后端签好的**完整外部地址**，不拼 API_BASE；
 *   - **不带 Authorization**：签名已经在 URL 里，多带一个头反而可能让签名对不上；
 *   - 对象存储回 403 是签名过期或不匹配，**不是登录失效**，不能走 401 登出那一套；
 *   - 响应不是我们的 envelope，不解析。
 *
 * ★ Content-Type 必须和申请上传时后端回执里给的**一字不差** —— 它被签进了 URL。
 *   浏览器对 .step / .x_t 这类文件给的 File.type 常是空串，所以一律用回执里的值，不用 file.type。
 *
 * 用 XMLHttpRequest 而不是 fetch：fetch 拿不到上传进度。
 */
export function putToSignedUrl(
    url: string,
    file: Blob,
    contentType: string,
    onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', url)
        xhr.setRequestHeader('Content-Type', contentType)
        if (onProgress) {
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) onProgress(e.loaded, e.total)
            }
        }
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve()
            else reject(new ApiError('common.upload_failed', xhr.status))
        }
        xhr.onerror = () => reject(new ApiError('common.upload_failed', 0))
        xhr.send(file)
    })
}

// --- 快捷方法 ---

export const http = {
    get: <T>(path: string, options?: RequestOptions) =>
        request<T>(path, { ...options, method: 'GET' }),

    post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
        request<T>(path, { ...options, method: 'POST', body }),

    put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
        request<T>(path, { ...options, method: 'PUT', body }),

    patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
        request<T>(path, { ...options, method: 'PATCH', body }),

    delete: <T>(path: string, options?: RequestOptions) =>
        request<T>(path, { ...options, method: 'DELETE' }),
}
