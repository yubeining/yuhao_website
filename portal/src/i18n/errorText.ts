/**
 * 把任意异常翻成给人看的文案。页面不要直接显示 ApiError.messageCode —— 那是 i18n code，不是文案。
 */

import { ApiError } from '../services'
import type { Strings } from './strings'

// ★ 默认兜底必须走当前语言 —— 写死中文的话，欧洲客户恰好在出错时看到中文
export function errorText(t: Strings, e: unknown, fallback = t.common.actionFailed): string {
    if (!(e instanceof ApiError)) return fallback
    const code = e.messageCode.startsWith('common.validation_failed') ? 'common.validation_failed' : e.messageCode
    return t.errors[code] ?? fallback
}
