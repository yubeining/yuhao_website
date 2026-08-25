/**
 * 原型数据仓的状态容器与持久化。
 *
 * ★ 为什么要持久化：原型是单页状态机，刷新回登录页无所谓；
 *   移到真实路由之后，/customer/orders/SO-0001 这种地址必须能直接打开、
 *   能刷新、能发给别人看。数据只活在内存里的话，刷新就是 404。
 *   所以整个仓（含 id 序列号和会话）落 sessionStorage —— 关掉标签页即清空，
 *   演示时不会被上一次的脏数据干扰。
 *
 * ★ 用 sessionStorage 而不是 localStorage：这是演示数据，不是用户资产。
 *   跨标签页各自独立，同时开两个窗口演示客户端和供应商端互不打架。
 */

import { DEFAULT_PARAMS, DEFAULT_RATES, type PlatformParams, type Rate } from './params'
import { X, today } from './format'
import type { Company, Db, Seq, User } from './types'

/** 当前登录态。原型里的 S。 */
export interface MockSession {
    userId: string | null
    /** 当前生效的身份在 user.roles 里的下标 —— 一个用户可同时是客户和供应商 */
    roleIndex: number
    /** 注册后待验证的邮箱 */
    pendingMail?: string
}

export interface MockState {
    db: Db
    seq: Seq
    params: PlatformParams
    rates: Rate[]
    session: MockSession
}

// v4：定价参数和材料成本带上了演示种子（params.ts）。种子只在 loadState 取不到
// 存档时才播，所以停在 v3 存档上的会话吃不到它 —— 换 key 是让它们重播一次，
// 否则打开还是「一条材料都没配」。
const STORAGE_KEY = 'mfg.prototype.v4'

const emptyDb = (): Db => ({
    companies: [],
    users: [],
    invites: [],
    orders: [],
    quotes: [],
    pkgs: [],
    contracts: [],
    invoices: [],
})

const emptySeq = (): Seq => ({
    so: 0, pt: 0, qt: 0, dp: 0, ct: 0, inv: 0, cid: 0, uid: 0, iv: 0,
})

/** 单号生成。原型的 nid()，序列号存在 state 里以便持久化。 */
export const nextId = (seq: Seq, k: keyof Seq) =>
    `${k.toUpperCase()}-${String(++seq[k]).padStart(4, '0')}`

const addCompany = (s: MockState, o: Partial<Company> & { name: string; kind: Company['kind'] }): Company => {
    const c: Company = { status: 'active', ...o, id: 'C' + ++s.seq.cid }
    s.db.companies.push(c)
    return c
}

const addUser = (s: MockState, o: Omit<User, 'id' | 'verified'> & { verified?: boolean }): User => {
    const u: User = { verified: true, ...o, id: 'U' + ++s.seq.uid }
    s.db.users.push(u)
    return u
}

/**
 * 种子数据：平台自己 + 一家已开通的供应商 + 一个客户 + 一个内部账号。
 *
 * ★ 刻意保持匿名（「客户 A 公司」「材料 A」「设备类型 1」）——
 *   原型要给外部看，真实客户名和工艺参数不能进演示数据。
 */
export const seed = (): MockState => {
    const s: MockState = {
        db: emptyDb(),
        seq: emptySeq(),
        params: { ...DEFAULT_PARAMS },
        rates: DEFAULT_RATES.map((r) => ({ ...r })),
        session: { userId: null, roleIndex: 0 },
    }

    const plat = addCompany(s, { name: '融一智造', kind: 'platform' })
    const supA = addCompany(s, {
        name: '供应商 A', kind: 'supplier', status: 'active', tier: 'A',
        code: X, addr: X, contact: X, phone: X, bank: X, acct: X,
        machines: [
            { type: '设备类型 1', qty: '', size: '', prec: '' },
            { type: '设备类型 2', qty: '', size: '', prec: '' },
        ],
        scope: '全部品类',
    })
    const custA = addCompany(s, { name: '客户 A 公司', kind: 'customer', status: 'active', country: X })

    addUser(s, { name: '内部 C', mail: 'staff-c@example.com', pw: '123456', roles: [{ role: 'ops', companyId: plat.id }] })
    addUser(s, { name: '客户 A', mail: 'customer-a@example.com', pw: '123456', roles: [{ role: 'customer', companyId: custA.id }] })
    addUser(s, {
        name: '用户 B', mail: 'user-b@example.com', pw: '123456',
        roles: [{ role: 'supplier', companyId: supA.id }, { role: 'customer', companyId: supA.id }],
    })
    // 同一家企业既接单又下单 —— 身份切换菜单要有东西可切才看得出设计意图
    supA.kind = 'both'

    s.db.invites.push({
        id: 'IV0', name: '供应商 B', mail: 'supplier-b@example.com',
        at: today(), used: false,
    })

    return s
}

export const loadState = (): MockState => {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY)
        if (raw) return JSON.parse(raw) as MockState
    } catch {
        // 存档格式变了（改过 types.ts）就当没有，重新播种。
        // 这里不上报也不提示 —— 演示数据坏掉的唯一正确处理就是重来一份。
    }
    return seed()
}

export const saveState = (s: MockState) => {
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    } catch {
        // sessionStorage 满了或被禁用。演示数据丢了不影响当前页面继续用，
        // 只是刷新会回到种子状态 —— 不值得为此打断用户。
    }
}

export const resetState = (): MockState => {
    sessionStorage.removeItem(STORAGE_KEY)
    return seed()
}

/** 深拷贝一份再改，保证 React 认得出状态变了。数据量是演示级别，拷贝成本可忽略。 */
export const clone = (s: MockState): MockState => JSON.parse(JSON.stringify(s)) as MockState
