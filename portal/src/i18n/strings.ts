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
    },
}
