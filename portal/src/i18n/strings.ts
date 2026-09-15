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
    /** 品牌侧的四步流程图：[标题, 说明] */
    flow: [string, string][]
    login: {
        h: string; sub: string; subA: string
        email: string; pw: string; forgot: string; submit: string; or: string
        wx: string; demo: string; demoHint: string
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
        flow: [
            ['上传', '图纸与清单，格式不限'],
            ['报价', '解析后当场给价'],
            ['抢单', '供应商接单，成本锁定'],
            ['交付', '生产、质检、出货'],
        ],
        login: {
            h: '登录', sub: '还没有账号？', subA: '注册',
            email: '企业邮箱', pw: '密码', forgot: '忘记密码？', submit: '登录', or: '或',
            wx: '微信登录', demo: '演示账号', demoHint: '点一下自动填入邮箱与密码',
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
        flow: [
            ['Upload', 'Drawings and BOM, any format'],
            ['Quote', 'Priced on the spot'],
            ['Claim', 'A supplier takes it, cost locked'],
            ['Deliver', 'Production, QC, shipment'],
        ],
        login: {
            h: 'Sign in', sub: "Don't have an account? ", subA: 'Sign up',
            email: 'Work email', pw: 'Password', forgot: 'Forgot password?',
            submit: 'Sign in', or: 'or',
            wx: 'Continue with WeChat', demo: 'Demo accounts',
            demoHint: 'Click to fill in the email and password',
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
