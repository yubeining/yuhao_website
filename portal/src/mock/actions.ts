/**
 * 业务动作。原型里的 A.* 逐条移植。
 *
 * ★ 每个动作签名统一为 (state, ...args) => void，就地改传进来的 state。
 *   调用方（MockProvider.act）负责先 clone 再传进来，所以这里放心改。
 *
 * ★ 状态流转的规则写在这里，不写在页面里 —— 页面只负责画和调用。
 *   将来换成真后端时，删掉这个文件、把调用点换成 services/ 的请求即可，
 *   页面不用动。
 */

import { X, fmtDate, now, parseStamp, plus, plusHours, today } from './format'
import { estimate, usable } from './ai'
import { custUnit, num, pricingBlockers, supTarget } from './params'
import { nextId, type MockState } from './store'
import type { Company, LineStat, Order, OrderPart, PartExecStatus, Quote, QuoteItem } from './types'

/* ── 查找 ─────────────────────────────────────────────────────────── */

export const findCompany = (s: MockState, id: string | null | undefined) =>
    s.db.companies.find((c) => c.id === id)

export const findUserByMail = (s: MockState, mail: string) =>
    s.db.users.find((u) => u.mail.toLowerCase() === String(mail || '').trim().toLowerCase())

export const currentUser = (s: MockState) => s.db.users.find((u) => u.id === s.session.userId)

export const currentRole = (s: MockState) => {
    const u = currentUser(s)
    return u ? u.roles[s.session.roleIndex] : undefined
}

export const currentCompany = (s: MockState) => {
    const r = currentRole(s)
    return r ? findCompany(s, r.companyId) : undefined
}

/* ── 账号 ─────────────────────────────────────────────────────────── */

export interface SignupInput {
    company: string
    country: string
    name: string
    mail: string
    pw: string
}

export const signup = (s: MockState, input: SignupInput) => {
    const c: Company = {
        id: 'C' + ++s.seq.cid,
        name: input.company,
        kind: 'customer',
        country: input.country,
        status: 'active',
    }
    s.db.companies.push(c)
    s.db.users.push({
        id: 'U' + ++s.seq.uid,
        name: input.name,
        mail: input.mail,
        pw: input.pw,
        verified: false,
        roles: [{ role: 'customer', companyId: c.id }],
    })
    s.session.pendingMail = input.mail
}

export const verifyMail = (s: MockState) => {
    const u = findUserByMail(s, s.session.pendingMail || '')
    if (u) u.verified = true
}

/**
 * 登录。返回错误文案，null 表示成功。
 *
 * ★ 三种失败分开报，不合并成「账号或密码错误」—— 这是内部演示原型，
 *   要让人看清每一条校验；真实登录接口反过来必须合并（防账号枚举）。
 */
export const login = (s: MockState, mail: string, pw: string): string | null => {
    const u = findUserByMail(s, mail)
    if (!u) return '找不到这个邮箱对应的账号'
    if (u.pw !== pw) return '密码不正确'
    if (!u.verified) return '邮箱尚未验证，请先点击验证邮件里的链接'
    s.session.userId = u.id
    s.session.roleIndex = 0
    return null
}

export const logout = (s: MockState) => {
    s.session = { userId: null, roleIndex: 0 }
}

/* ── 供应商入驻 ───────────────────────────────────────────────────── */

export const invite = (s: MockState, name: string, mail: string) => {
    s.db.invites.push({
        id: 'IV' + ++s.seq.iv,
        name,
        mail,
        at: today(),
        used: false,
    })
}

export interface OnboardInput {
    name: string
    code: string
    addr: string
    factory: string
    contact: string
    phone: string
    invTitle: string
    taxNo: string
    bank: string
    acct: string
    machines: Company['machines']
    cmm: string
    report: string
    mail: string
    pw: string
}

export const onboard = (s: MockState, input: OnboardInput) => {
    const c: Company = {
        id: 'C' + ++s.seq.cid,
        name: input.name,
        kind: 'supplier',
        // ★ review 而不是 active：交完材料只是排队，抢单要等考察定级
        status: 'review',
        tier: '',
        code: input.code,
        addr: input.addr,
        factory: input.factory,
        contact: input.contact,
        phone: input.phone,
        invTitle: input.invTitle,
        taxNo: input.taxNo,
        bank: input.bank,
        acct: input.acct,
        machines: (input.machines || []).filter((m) => m.type),
        cmm: input.cmm,
        report: input.report,
        scope: '',
        at: today(),
    }
    s.db.companies.push(c)
    s.db.users.push({
        id: 'U' + ++s.seq.uid,
        name: input.contact || '联系人',
        mail: input.mail,
        pw: input.pw,
        verified: true,
        roles: [{ role: 'supplier', companyId: c.id }],
    })
    const iv = s.db.invites.find((i) => !i.used)
    if (iv) iv.used = true
}

export const approve = (s: MockState, companyId: string, tier: string, scope: string) => {
    const c = findCompany(s, companyId)
    if (!c) return
    c.status = 'active'
    c.tier = tier
    c.scope = scope || '全部品类'
}

/** 空白判定：未填、空串、纯空格都算没填 */
const blank = (v: unknown) => !String(v ?? '').trim()

/* ── 客户：订单与零件 ─────────────────────────────────────────────── */

/**
 * 建订单。订单是整条链的主干，客户先建它，再往里加零件。
 * 返回新订单，调用方据此跳转。
 */
export const createOrder = (s: MockState, title: string): Order => {
    const company = currentCompany(s)!
    const order: Order = {
        id: nextId(s.seq, 'so'),
        companyId: company.id,
        title: title || '未命名订单',
        status: 'draft',
        parts: [],
        at: now(),
        want: '',
    }
    s.db.orders.push(order)
    return order
}

export const updateOrder = (s: MockState, id: string, patch: Partial<Order>) => {
    const o = s.db.orders.find((x) => x.id === id)
    if (o) Object.assign(o, patch)
}

/** 只有草稿状态的订单能删 —— 已经提交询价的删掉会让报价单指空。 */
export const deleteOrder = (s: MockState, id: string) => {
    const o = s.db.orders.find((x) => x.id === id)
    if (o?.status === 'draft') s.db.orders = s.db.orders.filter((x) => x.id !== id)
}

/**
 * 建 / 改零件时能传的字段。
 * ★ 不含 version —— 版本是我方生成的，调用方不许传（CLAUDE.md §3 铁律 3：
 *   服务端算出来的值一律服务端推导，不收调用方的）。
 */
export type PartInput = Omit<OrderPart, 'id' | 'version'>

export const addPart = (s: MockState, orderId: string, input: PartInput): OrderPart | undefined => {
    const o = s.db.orders.find((x) => x.id === orderId)
    if (!o || o.status !== 'draft') return undefined
    // ★ 版本由我方生成，新建就是第 1 版
    const part: OrderPart = { id: nextId(s.seq, 'pt'), ...input, version: 1 }
    o.parts.push(part)
    return part
}

/** 两组图纸是不是同一批（按文件名比，不比顺序） */
const sameFiles = (a: { name: string }[], b: { name: string }[]) =>
    a.length === b.length && a.every((x) => b.some((y) => y.name === x.name))

/**
 * 改零件。
 *
 * ★★ 图纸变了 **且这个零件已经被报过价** → 版本自动 +1。
 *
 *   为什么用「已报价」当界线：报价之前反复换图只是还没定稿，
 *   每换一次就升一版会把版本号变成噪音。报价之后换图不一样 ——
 *   那份报价是照着旧图算的，已经失效了，这一刻必须留痕。
 *
 * ★ 升版之后清掉单价，整单要重新提交。已发出的那张报价单不动，
 *   它指向的仍然是当时那一版（CLAUDE.md §10 C2）。
 */
export const updatePart = (s: MockState, orderId: string, partId: string, patch: Partial<PartInput>) => {
    const o = s.db.orders.find((x) => x.id === orderId)
    const p = o?.parts.find((x) => x.id === partId)
    if (!p) return
    const drawingsChanged = patch.files !== undefined && !sameFiles(patch.files, p.files)
    const wasQuoted = p.unit !== undefined
    // ★ 材料变了，基准成本就作废 —— 成本是按材料估的，换了材料还留着旧价，
    //   那个价就成了一个来源已经不存在的数字。图纸变了同理。
    const specChanged = drawingsChanged || (patch.mat !== undefined && patch.mat !== p.mat)
    Object.assign(p, patch)
    if (specChanged) {
        delete p.base
        delete p.baseSrc
        delete p.baseAt
        delete p.ai
    }
    if (drawingsChanged && wasQuoted) {
        p.version += 1
        p.unit = undefined
        p.total = undefined
    }
}

export const removePart = (s: MockState, orderId: string, partId: string) => {
    const o = s.db.orders.find((x) => x.id === orderId)
    if (o && o.status === 'draft') o.parts = o.parts.filter((p) => p.id !== partId)
}

/**
 * 零件信息够不够拿去报价。
 *
 * ★ 图号 / 名称 / 数量缺失 = 收不进来；版本或材料缺失 = 能提交但不能报价。
 *   版本和材料不算阻断，因为真实客户清单里根本没有这两列（设计文档 9 §3）。
 */
export const partStat = (p: Pick<OrderPart, 'no' | 'name' | 'qty' | 'mat' | 'files'>): LineStat => {
    if (blank(p.no) || blank(p.name) || blank(p.qty)) return 'blocked'
    // ★ 判据是「有没有图纸」和「有没有材料」，不是「有没有版本字母」。
    //   真正的锚点是那份图纸文件本身 —— 攥着客户传的那个文件，
    //   就精确知道要做什么，版本字母只是人嘴上好称呼。
    //   材料另说：它是定价公式的直接输入，缺了算不出价。
    if (!p.files.length || blank(p.mat)) return 'pending'
    return 'ready'
}

/** 能进报价的零件。材料是定价的直接输入，缺了算不出价。 */
export const quotableParts = (o: Order) => o.parts.filter((p) => partStat(p) === 'ready')

/* ── 估价与报价 ───────────────────────────────────────────────────── */

/** 订单能不能提交：至少一个零件，且**每一个**都齐全。 */
export const orderReady = (o: Order) =>
    o.parts.length > 0 && o.parts.every((p) => partStat(p) === 'ready')

/**
 * 提交订单，生成报价单。
 *
 * ★★ **整单提交，不支持只报其中几个零件。**
 *
 *   订单本身就是客户在表达「这些东西是一起的」——真实合同是一份文件、
 *   一个总价、58 个零件，没有为其中 57 个签合同这种事。
 *   允许挑子集会立刻带来三个说不清的问题：订单总额是多少、
 *   哪一份报价才是当前有效的、客户确认了一部分算不算确认。
 *
 *   所以有零件没齐就整单提交不了，缺哪个补哪个。
 *
 * ★ 一个订单一份报价单。补齐之后重新提交仍是这一份，不产生第二版。
 */
export const submitOrder = (s: MockState, orderId: string) => {
    const o = s.db.orders.find((x) => x.id === orderId)
    if (!o || o.status !== 'draft' || !orderReady(o)) return
    o.status = 'pricing'
    o.submittedAt = now()
}

/**
 * 跑一遍 AI 估价。**只填还没有基准成本的零件。**
 *
 * ★ 已经定过价的不覆盖 —— 运营手工改过的价，绝不能被后来的一次自动估价冲掉。
 *
 * ★ 估价结果**不管采不采用都留在零件上**（part.ai）：
 *   置信度够就落价（baseSrc = 'ai'），不够就只留结果、不落价，转人工（文档 8 §5）。
 *   留着是为了让运营看见「模型说了什么、有多大把握」，那是判断手填价合不合理的依据。
 *
 * 返回这一轮估了几个、其中几个够格采用。
 */
export const runAi = (s: MockState, orderId: string) => {
    const o = s.db.orders.find((x) => x.id === orderId)
    if (!o) return { ran: 0, taken: 0 }
    const at = now()
    let ran = 0
    let taken = 0
    o.parts.forEach((p) => {
        if (p.base != null) return
        const e = estimate(p, s.rates, at)
        p.ai = e
        ran++
        if (usable(e)) {
            p.base = e.base
            p.baseSrc = 'ai'
            p.baseAt = at
            taken++
        }
    })
    return { ran, taken }
}

/**
 * 人工定价 —— 运营给某个零件填基准成本（¥/件）。
 *
 * ★★ 这是 AI 说「没把握」之后唯一的出路（文档 8 §5），也是随时可以推翻 AI 的入口。
 *
 * ★ 覆写会记下来源和时刻。**不许静默改价** —— 事后要能说清这一行的价
 *   是模型估的还是人定的，否则复盘时分不清是模型不准还是人填错了。
 *
 * ★ 传 null 表示撤销人工价，退回「还没有基准成本」。不顺手把 AI 的估值填回去 ——
 *   撤销是「我不认这个价」，不是「我要用模型那个价」，那是另一个决定。
 */
export const setBase = (s: MockState, orderId: string, partId: string, value: number | null) => {
    const p = s.db.orders.find((x) => x.id === orderId)?.parts.find((x) => x.id === partId)
    if (!p) return
    if (value == null || !(value > 0)) {
        delete p.base
        delete p.baseSrc
        delete p.baseAt
        return
    }
    p.base = +value.toFixed(2)
    p.baseSrc = 'manual'
    p.baseAt = now()
}

/**
 * 这一单能不能**自动**出报价单 —— 每一个零件都是 AI 估出来的。
 *
 * ★★ 只要有一个零件是人工定的价，就不自动出单。
 *   人工定价意味着这一单已经在运营手上了：他刚填完最后一个价，
 *   下一秒单子自己发出去，等于把「再看一眼」的机会拿掉了。
 *   AI 全程搞定的单子不占人，自动走；沾了人的单子，由那个人按按钮（文档 8 §5）。
 */
export const autoQuotable = (o: Order) =>
    o.parts.length > 0 && o.parts.every((p) => p.baseSrc === 'ai')

/**
 * 估价完成，出报价单。
 *
 * ★ 由估价过程结束时调用，不是提交那一刻。**估价要时间** ——
 *   解析几何、识别特征、算工时，快也要几秒。
 *   界面上必须表现出这段时间，不能装成填完材料就有价。
 */
export const finishPricing = (s: MockState, orderId: string): Quote | undefined => {
    const o = s.db.orders.find((x) => x.id === orderId)
    if (!o || o.status !== 'pricing') return undefined

    // ★★ 闸门：系数没设全、或有零件还没有基准成本 → 不出价，单子停在待估价。
    //   以前这里有个 ¥100 的兜底价，随便填个材料都能"估"出结果 —— 那是编数字。
    if (pricingBlockers(s.params, o.parts).length) return undefined

    const items: QuoteItem[] = o.parts.map((p) => {
        const unit = custUnit(s.params, p.base)!
        const total = +(unit * num(p.qty)).toFixed(2)
        p.unit = unit
        p.total = total
        return {
            partId: p.id, no: p.no, name: p.name,
            version: p.version, customerRev: p.customerRev,
            mat: p.mat, surf: p.surf, qty: p.qty, unit, total,
            // 供应商目标价也在此刻算死 —— 发布时不回头读参数（C2）
            target: supTarget(s.params, p.base)!,
            // 基准成本和它的来源一并快照。毛利要按当时的成本算，
            // 「这个价是谁定的」也要跟着单据走，不能回头读零件（C2）
            base: p.base!,
            baseSrc: p.baseSrc ?? 'manual',
        }
    })
    const quote: Quote = {
        id: nextId(s.seq, 'qt'),
        orderId: o.id,
        companyId: o.companyId,
        at: now(),
        items,
        total: +items.reduce((a, i) => a + i.total, 0).toFixed(2),
        wantLead: o.want ? o.want + ' 天' : X,
        inco: 'EXW',
        valid: plus(s.params.validDays),
        fx: s.params.fx!,
        status: 'open',
    }
    s.db.quotes.push(quote)
    o.quoteId = quote.id
    o.status = 'quoted'
    o.quotedAt = now()
    return quote
}

/* ── 确认报价 ─────────────────────────────────────────────────────── */

/**
 * 客户确认报价。**确认的只是价格，不是产能。**
 *
 * ★ 确认之后订单还不能生产 —— 要先发布到订单市场、有供应商接单，
 *   产能才算锁定。这一步只是把价格定死。
 */
export const confirmQuote = (s: MockState, quoteId: string): Order | undefined => {
    const q = s.db.quotes.find((x) => x.id === quoteId)
    if (!q || q.status !== 'open') return undefined
    q.status = 'accepted'
    q.acceptedAt = now()
    const o = s.db.orders.find((x) => x.id === q.orderId)
    if (o) {
        o.status = 'toPublish'
        o.confirmedAt = now()
        o.parts.forEach((p) => { p.done = 0 })
    }
    return o
}

/* ── 发布到订单市场 ───────────────────────────────────────────────── */

/**
 * 把已确认的订单发布到订单市场：每个已报价的零件拆成一个独立派单包。
 *
 * ★ 一个零件一个包，各自独立抢单、独立成败。某一行无人接单退回，
 *   不影响同一订单的其他行（dropLine）。
 *
 * ★ 发布是**我方的动作**，不是客户的 —— 供应商是我们的资源，目标价是内部算的，
 *   什么时候放给供应商看由运营决定。所以入口在内部端的派单管理。
 */
export const publishOrder = (s: MockState, orderId: string) => {
    const o = s.db.orders.find((x) => x.id === orderId)
    if (!o || o.status !== 'toPublish') return
    const quote = s.db.quotes.find((q) => q.id === o.quoteId)
    o.parts.forEach((p, i) => {
        // ★ 目标价用估价时的快照，不重算 —— 参数后来改过也不影响已确认的单（C2）
        const target = quote?.items.find((it) => it.partId === p.id)?.target
        if (target === undefined) return
        s.db.pkgs.push({
            id: nextId(s.seq, 'dp'),
            orderId: o.id,
            line: i,
            partName: p.name,
            rev: p.customerRev, mat: p.mat, surf: p.surf,
            qty: num(p.qty),
            target,
            total: +(target * num(p.qty)).toFixed(2),
            wantLead: o.want ? o.want + ' 天' : X,
            pay: payTerm(s.params.payDays),
            at: now(),
            exp: plusHours(s.params.grabHours),
            status: 'open',
            sup: null,
            watch: 0,
        })
        p.st = 'waiting'
    })
    o.status = 'published'
    o.publishedAt = now()
}

/* ── 供应商：抢单 ─────────────────────────────────────────────────── */

export const canGrab = (s: MockState) => {
    const c = currentCompany(s)
    return !!c && c.status === 'active'
}

/** 抢单。返回错误文案，null 表示成功。 */
export const grab = (s: MockState, pkgId: string): string | null => {
    const p = s.db.pkgs.find((x) => x.id === pkgId)
    if (!p) return '派单包不存在'
    if (p.status !== 'open') return '这个派单包已经被抢走了'
    // ★ 界面上抢单按钮已经按 canGrab 禁用了，这里再挡一道 ——
    //   资质闸门放动作层是全项目的惯例（报工查排产、估价查参数），不能只靠按钮变灰。
    if (!canGrab(s)) return '资质考察通过后才能抢单'
    const company = currentCompany(s)!
    p.status = 'taken'
    p.sup = company.id
    p.tookAt = now()
    const ct = {
        id: nextId(s.seq, 'ct'),
        pkgId: p.id,
        sup: p.sup,
        at: now(),
        amount: p.total,
        status: 'unsigned' as const,
    }
    s.db.contracts.push(ct)
    p.contractId = ct.id
    syncOrder(s, p.orderId)
    return null
}

export const sign = (s: MockState, contractId: string) => {
    const ct = s.db.contracts.find((c) => c.id === contractId)
    if (!ct) return
    ct.status = 'signed'
    ct.signedAt = now()
    const p = s.db.pkgs.find((x) => x.id === ct.pkgId)
    if (p) syncOrder(s, p.orderId)
}


/**
 * 按派单包的状态推算订单和零件的状态。
 *
 * ★ 订单状态是零件状态的**汇总**，不单独维护：
 *     全部签约      → 已接单
 *     全部确认排产  → 待生产
 *     有人开始报数  → 生产中
 *     全部报满      → 生产完成
 *   已退回的零件不参与判断 —— 它不做了，不该拖住整单。
 */
export const syncOrder = (s: MockState, orderId: string) => {
    const o = s.db.orders.find((x) => x.id === orderId)
    if (!o) return
    const ps = s.db.pkgs.filter((p) => p.orderId === orderId)
    if (!ps.length) return

    ps.forEach((p) => {
        const part = o.parts[p.line]
        if (!part) return
        if (p.status === 'dropped') { part.dropped = true; part.st = undefined; return }
        const ct = s.db.contracts.find((c) => c.pkgId === p.id)
        const signed = ct?.status === 'signed'
        part.st = (p.done ?? 0) >= p.qty ? 'produced'
            : (p.done ?? 0) > 0 ? 'producing'
                : signed ? 'taken'
                    : 'waiting'
        part.done = p.done ?? 0
    })

    const live = o.parts.filter((p) => !p.dropped && p.st)
    if (!live.length) return
    const all = (st: PartExecStatus) => live.every((p) => p.st === st)
    const some = (st: PartExecStatus) => live.some((p) => p.st === st)

    if (all('produced')) o.status = 'produced'
    else if (some('producing') || some('produced')) o.status = 'producing'
    else if (all('taken')) {
        // 已接单之后，供应商确认排产才进待生产
        o.status = live.every((p) => scheduledOf(s, o, p)) ? 'toProduce' : 'taken'
        if (o.status === 'taken' && !o.takenAt) o.takenAt = now()
    } else o.status = 'published'
}

/** 这个零件对应的派单包有没有确认过排产 */
const scheduledOf = (s: MockState, o: Order, part: OrderPart) => {
    const i = o.parts.indexOf(part)
    return s.db.pkgs.find((p) => p.orderId === o.id && p.line === i)?.scheduled === true
}

/**
 * 供应商确认排产。签完合同之后的一步 ——
 * 他排进生产计划了，但还没开工。
 */
export const schedule = (s: MockState, pkgId: string) => {
    const p = s.db.pkgs.find((x) => x.id === pkgId)
    if (!p) return
    p.scheduled = true
    syncOrder(s, p.orderId)
}

/**
 * 超时无人抢 → 退回该行；其余行照常成单。
 *
 * ★ 这是「一行一个包」这个拆法的意义所在：一行找不到产能，
 *   不能把整单拖死。退回的行不计费，客户那边看到的是部分成单。
 */
export const dropLine = (s: MockState, pkgId: string) => {
    const p = s.db.pkgs.find((x) => x.id === pkgId)
    if (!p) return
    p.status = 'dropped'
    syncOrder(s, p.orderId)
}

/**
 * 调价重挂。新目标价由运营填 ——
 * 以前这里写死自动加 5%：调价重派这件事有出处（文档 6/8），
 * 每次加几个点没人定过，不能替运营拍。
 */
export const repost = (s: MockState, pkgId: string, newTarget: unknown) => {
    const p = s.db.pkgs.find((x) => x.id === pkgId)
    const t = num(newTarget)
    if (!p || t <= 0) return
    p.status = 'open'
    p.target = t
    p.total = +(t * p.qty).toFixed(2)
    p.exp = plusHours(s.params.grabHours)
    p.reprice = (p.reprice || 0) + 1
    syncOrder(s, p.orderId)
}

/* ── 生产上报 ─────────────────────────────────────────────────────── */

export const report = (s: MockState, pkgId: string, done: unknown) => {
    const p = s.db.pkgs.find((x) => x.id === pkgId)
    if (!p) return
    if (!p.scheduled) return          // 没确认排产就不该有完成数
    p.done = Math.min(num(done), p.qty)
    if (p.done >= p.qty) p.status = 'done'
    syncOrder(s, p.orderId)
}

export const deliver = (s: MockState, orderId: string) => {
    const o = s.db.orders.find((x) => x.id === orderId)
    if (!o) return
    o.status = 'shipping'
    o.deliveredAt = now()
    s.db.pkgs
        .filter((p) => p.orderId === o.id && p.status === 'done')
        .forEach((p) => {
            p.delivered = now()
        })
}

/** 登记客户回款。背靠背结算的起算点 —— 供应商应付日从这天 +payDays。 */
export const custPaid = (s: MockState, orderId: string) => {
    const o = s.db.orders.find((x) => x.id === orderId)
    if (o) o.paidAt = now()
}

export const uploadInvoice = (s: MockState, pkgId: string, invNo: string) => {
    const p = s.db.pkgs.find((x) => x.id === pkgId)
    if (!p) return
    s.db.invoices.push({
        id: nextId(s.seq, 'inv'),
        pkgId: p.id,
        sup: p.sup!,
        no: invNo || X,
        at: now(),
        status: 'checking',
    })
    p.invoice = true
}

/* ── 定价参数 ─────────────────────────────────────────────────────── */

/**
 * 新增一种材料的基准成本。名字和数值都是运营填的 ——
 * 材料没有主数据表（见 RatesPage 空态文案），不新增就永远出不了第一张报价。
 */
export const addRate = (s: MockState, mat: string, rate: unknown) => {
    const m = String(mat ?? '').trim()
    if (!m || num(rate) <= 0) return
    if (s.rates.some((r) => r.mat === m)) return
    s.rates.push({ mat: m, rate: num(rate) })
}

export const saveRates = (
    s: MockState,
    rateInputs: Record<number, string>,
    paramInputs: Record<string, string>,
) => {
    s.rates.forEach((r, i) => {
        const v = rateInputs[i]
        if (v !== undefined && v !== '') r.rate = num(v)
    })
    ;(['margin', 'spread', 'fx', 'payDays', 'grabHours', 'validDays'] as const).forEach((k) => {
        const v = paramInputs[k]
        if (v !== undefined && v !== '') s.params[k] = num(v)
    })
}

/* ── 供应商应付日 ─────────────────────────────────────────────────── */

/** 客户回款后 T+payDays。未回款或 T+N 没设置时返回 null。 */
export const dueDate = (s: MockState, o: Order | undefined): string | null =>
    o && o.paidAt && s.params.payDays != null
        ? fmtDate(new Date(parseStamp(o.paidAt).getTime() + s.params.payDays * 864e5))
        : null

/**
 * 派单包上的付款条款文案。背靠背是会议拍板的；T+N 的 N 是平台参数，
 * 运营没设置时只说机制，不编一个天数。
 */
const payTerm = (payDays: number | null) =>
    payDays != null ? `客户回款后 T+${payDays} 天` : '客户回款后支付（背靠背，T+N 天待平台设置）'
