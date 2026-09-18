/**
 * 界面文案。
 *
 * ★ 翻译全在前端 —— 后端只返 i18n code，一个字的文案都不返（CLAUDE.md §6）。
 *   所以这个文件将来会长成整个平台的文案真源，现在先把登录/注册这条
 *   对外的路径做全。
 *
 * ★ 目前只有登录与注册是中英双语，其余界面是中文。
 *   这不是漏做：登录注册是欧洲客户第一眼看到的，必须有英文；
 *   内部后台和供应商端的使用者都在国内，先不铺。
 *   补英文时在这里加 key，不要在页面里写文案。
 */

export type Lang = 'zh' | 'en'

export interface Strings {
    roles: Record<'customer' | 'supplier' | 'ops', string>
    /**
     * 品牌侧的四步流程图：只有步骤名。
     * ★ 2026-09-18 删掉了每步的说明（「解析后当场给价」「供应商接单，成本锁定」等）—— 和实际不符，报价是人工的。
     */
    flow: string[]
    login: {
        h: string; sub: string; subA: string
        email: string; pw: string; forgot: string; submit: string; or: string
        wx: string
        note: string; invited: string; invitedA: string
    }
    reg: {
        h: string; sub: string; subA: string
        co: string; coP: string; country: string
        name: string; nameP: string; email: string; pw: string; pwP: string
        agree: string; submit: string
    }
    /** 后端返回的 i18n code → 文案。后端只返 code（CLAUDE.md §6），翻译全在这里。 */
    errors: Record<string, string>
}

export const STRINGS: Record<Lang, Strings> = {
    zh: {
        roles: { customer: '客户', supplier: '供应商', ops: '内部' },
        flow: ['上传', '报价', '抢单', '交付'],
        login: {
            h: '登录', sub: '还没有账号？', subA: '注册',
            email: '企业邮箱', pw: '密码', forgot: '忘记密码？', submit: '登录', or: '或',
            wx: '微信登录',
            note: '继续即表示同意服务条款与隐私政策。',
            invited: '收到供应商邀请？', invitedA: '从邀请链接入驻',
        },
        reg: {
            h: '注册', sub: '已有账号？', subA: '返回登录',
            co: '公司名称', coP: '公司名称', country: '国家 / 地区',
            name: '联系人姓名', nameP: '姓名', email: '企业邮箱',
            pw: '设置密码', pwP: '至少 8 位',
            agree: '我已阅读并同意服务条款与隐私政策',
            submit: '创建账号',
        },
        errors: {
            'part.code_taken': '这个图号已经有零件了',
            'part.not_found': '零件不存在',
            'part.revision_conflict': '有人同时在改这个零件的版本，请刷新后重试',
            'part.revision_not_found': '图纸版本不存在',
            'part.revision_locked': '这一版图纸已随订单提交锁定，不能再改；要换图纸请开新版本',
            'part.revision_not_locked': '当前图纸还没锁定，直接增删文件即可，不用开新版本',
            'part.file_type_not_allowed': '文件类型不支持，或文件内容和扩展名对不上',
            'part.file_not_pending': '这个文件的上传已经结束了',
            'part.file_object_missing': '文件没有传上去，请重新上传',
            'part.file_not_completed': '文件还没传完或已被删除，暂时不能查看',
            'part.file_not_found': '文件不存在',
            'order.not_found': '订单不存在',
            'order.not_draft': '订单已提交或已取消，不能再修改',
            'order.line_not_found': '零件行不存在',
            'order.no_lines': '订单里还没有零件',
            'order.line_missing_drawing': '有零件还没传图纸，传完才能提交',
            'order.not_quotable': '这张订单现在不能报价（已确认或已取消）',
            'order.not_quoted': '这张订单现在没有待确认的报价',
            'quote.not_found': '暂无报价',
            'quote.not_open': '这份报价已失效（已确认、已拒绝或已被新报价取代），请刷新',
            'quote.price_changed': '汇率刚刚更新，价格已变化，请核对新价格后再确认',
            'quote.fx_unavailable': '暂时取不到汇率，价格无法计算，请稍后再试',
            'quote.markup_missing': '这个客户还没设加成率，先设加成率再报价',
            'quote.lines_mismatch': '报价的零件行和订单不一致，请刷新后重填',
            'organization.not_found': '客户不存在',
            'auth.invite_invalid': '邀请链接无效：可能已过期、已被使用或已作废，请联系运营重新发',
            'auth.invite_not_found': '邀请不存在',
            'auth.invite_used': '这条邀请已经被用来注册了，不能作废',
            'auth.email_taken': '这个邮箱已经注册过了',
            'supplier.not_found': '供应商不存在',
            'dispatch.quantity_mismatch': '各份数量加起来必须等于这一行的数量（一次拆完）',
            'dispatch.duplicate_ops_order': '同一张生产订单只能出现一次',
            'dispatch.line_allocated': '这一行已经分配过了，先撤回再分',
            'dispatch.line_not_allocated': '这一行还没分配',
            'dispatch.order_not_confirmed': '客户还没确认报价，不能派单',
            'dispatch.ops_order_not_found': '生产订单不存在',
            'dispatch.ops_order_not_assembling': '生产订单已经派出去了，先收回才能改',
            'dispatch.ops_order_empty': '生产订单里还没有零件',
            'dispatch.ops_order_not_empty': '生产订单里还有零件，先撤回分配',
            'dispatch.suppliers_invalid': '请选择要派的供应商（不能重复）',
            'dispatch.supplier_not_dispatchable': '有供应商还没录折率或已停用，不能派单',
            'dispatch.not_open': '这张单已经不在派单中了（可能被别人接走或已收回）',
            'dispatch.not_assigned': '这张单现在没有供应商接着',
            'dispatch.not_targeted': '市场上的单不能拒接，不接就行',
            'dispatch.offer_not_found': '单子不存在或不是派给你的',
            'dispatch.supplier_order_not_found': '订单不存在',
            'dispatch.supplier_order_not_active': '这张订单已经取消了',
            'dispatch.base_price_missing': '找不到客户确认的原价，请联系运营',
            'common.conflict': '数据刚被别人改过，请刷新后重试',
            'common.upload_failed': '文件上传失败，请重试',
            'common.validation_failed': '填写的内容不完整或格式不对',
            'common.malformed_body': '提交的内容格式不对',
            'common.bad_request': '请求有误',
            'common.unsupported_media_type': '请求格式不支持',
            'common.method_not_allowed': '不支持这个操作',
            'common.not_found': '内容不存在',
            'common.forbidden': '没有权限',
            'common.unauthenticated': '登录已失效，请重新登录',
            'common.malformed_response': '服务器返回异常，请稍后重试',
            'common.internal_error': '服务器出错了，请稍后重试',
        },
    },
    en: {
        roles: { customer: 'Customer', supplier: 'Supplier', ops: 'Internal' },
        flow: ['Upload', 'Quote', 'Claim', 'Deliver'],
        login: {
            h: 'Sign in', sub: "Don't have an account? ", subA: 'Sign up',
            email: 'Work email', pw: 'Password', forgot: 'Forgot password?',
            submit: 'Sign in', or: 'or',
            wx: 'Continue with WeChat',
            note: 'By continuing you agree to our Terms and Privacy Policy.',
            invited: 'Invited as a supplier?', invitedA: 'Start onboarding',
        },
        reg: {
            h: 'Sign up', sub: 'Already have an account? ', subA: 'Sign in',
            co: 'Company name', coP: 'Company name', country: 'Country / Region',
            name: 'Contact name', nameP: 'Full name', email: 'Work email',
            pw: 'Password', pwP: 'At least 8 characters',
            agree: 'I agree to the Terms and Privacy Policy',
            submit: 'Sign up',
        },
        errors: {
            'part.code_taken': 'A part with this drawing number already exists',
            'part.not_found': 'Part not found',
            'part.revision_conflict': 'This part was changed at the same time. Refresh and try again',
            'part.revision_not_found': 'Drawing revision not found',
            'part.revision_locked': 'This drawing revision was locked when the order was submitted. Start a new revision to change it',
            'part.revision_not_locked': 'This drawing is not locked yet. Add or remove files directly',
            'part.file_type_not_allowed': 'File type not supported, or the content does not match the extension',
            'part.file_not_pending': 'This upload has already finished',
            'part.file_object_missing': 'The file did not arrive. Please upload it again',
            'part.file_not_completed': 'The file is not uploaded yet or was removed',
            'part.file_not_found': 'File not found',
            'order.not_found': 'Order not found',
            'order.not_draft': 'The order was already submitted or cancelled',
            'order.line_not_found': 'Order line not found',
            'order.no_lines': 'The order has no parts yet',
            'order.line_missing_drawing': 'Some parts have no drawing yet. Upload them before submitting',
            'order.not_quotable': 'This order cannot be quoted now',
            'order.not_quoted': 'This order has no quote waiting for confirmation',
            'quote.not_found': 'No quote yet',
            'quote.not_open': 'This quote is no longer open. Please refresh',
            'quote.price_changed': 'The exchange rate was just updated and the price changed. Please review the new price before confirming',
            'quote.fx_unavailable': 'Exchange rates are temporarily unavailable, so the price cannot be calculated. Please try again later',
            'quote.markup_missing': 'Set a markup for this customer before quoting',
            'quote.lines_mismatch': 'The quoted lines do not match the order. Refresh and try again',
            'organization.not_found': 'Customer not found',
            'auth.invite_invalid': 'This invitation link is invalid: it may have expired, been used or been revoked',
            'auth.invite_not_found': 'Invitation not found',
            'auth.invite_used': 'This invitation was already used and cannot be revoked',
            'auth.email_taken': 'This email is already registered',
            'supplier.not_found': 'Supplier not found',
            'dispatch.quantity_mismatch': 'The parts must add up to the line quantity',
            'dispatch.duplicate_ops_order': 'Each production order may appear only once',
            'dispatch.line_allocated': 'This line is already allocated',
            'dispatch.line_not_allocated': 'This line is not allocated',
            'dispatch.order_not_confirmed': 'The customer has not confirmed the quote yet',
            'dispatch.ops_order_not_found': 'Production order not found',
            'dispatch.ops_order_not_assembling': 'This production order has been dispatched. Recall it first',
            'dispatch.ops_order_empty': 'This production order has no parts',
            'dispatch.ops_order_not_empty': 'This production order still has parts',
            'dispatch.suppliers_invalid': 'Choose the suppliers to offer to',
            'dispatch.supplier_not_dispatchable': 'A supplier has no discount set or is disabled',
            'dispatch.not_open': 'This order is no longer open',
            'dispatch.not_assigned': 'No supplier holds this order',
            'dispatch.not_targeted': 'Market orders cannot be declined',
            'dispatch.offer_not_found': 'Order not found',
            'dispatch.supplier_order_not_found': 'Order not found',
            'dispatch.supplier_order_not_active': 'This order was cancelled',
            'dispatch.base_price_missing': 'The confirmed base price is missing',
            'common.conflict': 'This was just changed by someone else. Refresh and try again',
            'common.upload_failed': 'Upload failed. Please try again',
            'common.validation_failed': 'Some fields are missing or invalid',
            'common.malformed_body': 'The request was not in the expected format',
            'common.bad_request': 'Invalid request',
            'common.unsupported_media_type': 'Unsupported request format',
            'common.method_not_allowed': 'This operation is not supported',
            'common.not_found': 'Not found',
            'common.forbidden': 'Access denied',
            'common.unauthenticated': 'Your session expired. Please sign in again',
            'common.malformed_response': 'Unexpected server response. Please try again later',
            'common.internal_error': 'Something went wrong on our side. Please try again later',
        },
    },
}
