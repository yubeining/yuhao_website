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
import type { Db, Seq } from './types'

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

// v6：演示种子删掉了（2026-09-18）。换 key 让停在旧存档上的会话丢掉那批假数据。
// v5：派单包（Pkg）换成了生产订单（Prod），存档结构变了，老存档读不了。
// v4：定价参数和材料成本带上了演示种子（params.ts）。种子只在 loadState 取不到
// 存档时才播，所以停在旧存档上的会话吃不到它 —— 换 key 是让它们重播一次，
// 否则打开还是「一条材料都没配」。
const STORAGE_KEY = 'mfg.prototype.v6'

const emptyDb = (): Db => ({
    companies: [],
    users: [],
    invites: [],
    orders: [],
    quotes: [],
    prods: [],
    contracts: [],
    invoices: [],
})

const emptySeq = (): Seq => ({
    so: 0, pt: 0, qt: 0, po: 0, ct: 0, inv: 0, cid: 0, uid: 0, iv: 0,
})

/** 单号生成。原型的 nid()，序列号存在 state 里以便持久化。 */
export const nextId = (seq: Seq, k: keyof Seq) =>
    `${k.toUpperCase()}-${String(++seq[k]).padStart(4, '0')}`

/**
 * 初始状态：空的。
 *
 * ★ 2026-09-18 需求方决定「原型页保留，假数据删除」。原来这里播种的平台公司、「供应商 A」「客户 A 公司」、
 *   三个演示账号和一条供应商邀请都已删掉 —— 登录早已走真后端，这些只会让原型页显示编出来的交易方和计数。
 *   原型页现在显示空状态；页面顶上的横幅写明还没接真实数据。
 */
export const seed = (): MockState => ({
    db: emptyDb(),
    seq: emptySeq(),
    params: { ...DEFAULT_PARAMS },
    rates: DEFAULT_RATES.map((r) => ({ ...r })),
    session: { userId: null, roleIndex: 0 },
})

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
