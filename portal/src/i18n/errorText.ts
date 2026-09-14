/**
 * 把任意异常翻成给人看的文案。页面不要直接显示 ApiError.messageCode —— 那是 i18n code，不是文案。
 */

import { ApiError } from '../services'
import type { Strings } from './strings'

export function errorText(t: Strings, e: unknown, fallback = '操作失败，请重试'): string {
    if (!(e instanceof ApiError)) return fallback
    const code = e.messageCode.startsWith('common.validation_failed') ? 'common.validation_failed' : e.messageCode
    return t.errors[code] ?? fallback
}
