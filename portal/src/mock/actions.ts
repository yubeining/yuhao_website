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

import { X, fmtDate, now, parseStamp, plus, today } from './format'
import { custUnit, num, supTarget, SURFACES } from './params'
import { nextId, type MockState } from './store'
import type { Company, LineStat, Order, Pkg, Quote, Rfq, RfqLine } from './types'

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
        exp: plus(14),
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

/* ── 客户：询价 ───────────────────────────────────────────────────── */

const blank = (v: unknown) => !String(v ?? '').trim()

/**
 * 行状态三档。设计文档 9 §4.1。
 *
 * ★ 图号 / 名称 / 数量缺失才拒收 —— 这三样真实清单里一定有。
 *   版本和材料清单里没有（文档 9 §3），拒收它们等于拒收整份清单。
 */
export const lineStat = (l: RfqLine): LineStat => {
    if (blank(l.no) || blank(l.name) || blank(l.qty)) return 'blocked'
    if (blank(l.rev) || blank(l.mat)) return 'pending'
    return 'ready'
}

/** 能不能进报价。只有 ready 能 —— 材料是定价的直接输入，缺了算不出价。 */
export const quotable = (l: RfqLine) => lineStat(l) === 'ready'

/**
 * 上传文件 → 模拟解析。
 *
 * ★ 结构照真实客户清单（文档 9 §2）：有图号 / 名称 / 数量 / 三个参考编号，
 *   **没有材料**；版本只有能从图纸文件名解析出来的那几行才有。
 *   这不是为了演示好看造出来的分布 —— 真实清单就长这样。
 *
 * ★ 值全部匿名。样本里是客户的真实图号和课题号，不能进演示数据。
 */
export const parseFile = (): RfqLine[] => [
    // 图纸文件名里带版本，解析得出来
    { no: '图号 A', name: '压板', rev: 'A', mat: '', qty: 1, surf: SURFACES[0],
      taskNo: '批次 01', systemNo: '系统 1453', topicNo: '课题 A', files: [] },
    { no: '图号 B', name: '定位销', rev: 'A', mat: '', qty: 50, surf: SURFACES[0],
      taskNo: '批次 01', systemNo: '系统 1453', topicNo: '课题 A', files: [] },
    // 图纸是纯数字命名，解析不出版本，要人工补
    { no: '图号 C', name: '衬套', rev: '', mat: '', qty: 4, surf: SURFACES[0],
      taskNo: '批次 02', systemNo: '系统 1382', topicNo: '课题 B', files: [] },
    { no: '图号 D', name: '腔体', rev: 'B', mat: '', qty: 2, surf: SURFACES[0],
      taskNo: '批次 03', systemNo: '系统 36303', topicNo: '课题 C', files: [] },
]

/**
 * 提交询价。设计文档 9 §4.2 —— **导入不拦截，报价才拦截**。
 *
 *   收下所有非 blocked 的行（图号/名称/数量齐全即可）
 *   只给 ready 的行出报价（版本和材料齐全）
 *   pending 的行留在询价单里等补齐，不进报价也不计价
 *
 * ★ 返回报价单；一行都报不了时返回 undefined，询价单仍然建好。
 *   这不是失败 —— 客户的清单本来就缺材料，补齐是下一步，不是重来一次。
 */
export const submitRfq = (
    s: MockState, lines: RfqLine[], want: string,
): Quote | undefined => {
    const company = currentCompany(s)!
    const kept = lines.filter((l) => lineStat(l) !== 'blocked')
    const rfq: Rfq = {
        id: nextId(s.seq, 'rfq'),
        companyId: company.id,
        at: now(),
        want: want || X,
        lines: kept,
        status: 'draft',
        stage: 2,
    }
    s.db.rfqs.push(rfq)
    return makeQuote(s, rfq)
}

/**
 * 给询价单里已补齐的行出报价。补齐之后可以再调一次。
 *
 * ★ 已发出的报价不会因为后来补齐了别的行而变 —— 补齐的行进的是**新报价单**。
 *   改写历史报价是绝对禁止的（CLAUDE.md §10 C2）。
 */
export const makeQuote = (s: MockState, rfq: Rfq): Quote | undefined => {
    const already = new Set(
        s.db.quotes.filter((q) => q.rfqId === rfq.id).flatMap((q) => q.items.map((i) => i.no)),
    )
    const fresh = rfq.lines.filter((l) => quotable(l) && !already.has(l.no))
    if (!fresh.length) return undefined

    const items = fresh.map((l) => {
        const unit = custUnit(s.rates, s.params, l)
        return { ...l, unit, total: +(unit * num(l.qty)).toFixed(2) }
    })
    const quote: Quote = {
        id: nextId(s.seq, 'qt'),
        rfqId: rfq.id,
        companyId: rfq.companyId,
        at: now(),
        items,
        total: +items.reduce((a, i) => a + i.total, 0).toFixed(2),
        lead: rfq.want && rfq.want !== X ? rfq.want + ' 天' : X,
        valid: plus(14),
        inco: 'EXW 指定仓库',
        status: 'open',
    }
    s.db.quotes.push(quote)
    rfq.status = 'quoting'
    rfq.stage = 3
    rfq.quoteId = quote.id
    return quote
}

/**
 * 补齐一行的版本 / 材料 / 表面处理。
 *
 * ★ 这个动作代表的是「我方看图填 + 客户已确认」。真实实现里必须是两步：
 *   我方填 → 客户点确认。材料是定价的直接输入，我方看错牌号报出去的价就是错的，
 *   而客户从报价单上看不出这个数是谁定的（文档 9 §4.2）。
 */
export const fillLine = (
    s: MockState, rfqId: string, index: number,
    patch: { rev?: string; mat?: string; surf?: string },
) => {
    const rfq = s.db.rfqs.find((r) => r.id === rfqId)
    if (!rfq || !rfq.lines[index]) return
    Object.assign(rfq.lines[index], patch)
}

/* ── 客户：接受报价 → 产能确认期 + 拆包挂池 ─────────────────────── */

/**
 * 接受报价。生成订单，并把每一行拆成独立的派单包挂上抢单大厅。
 *
 * ★ 订单此刻是 capacity（产能确认中），不是成立 —— 合同以产能确认为准。
 *   所有包都抢到才转 confirmed（见 syncOrder）。
 */
export const acceptQuote = (s: MockState, quoteId: string): Order | undefined => {
    const q = s.db.quotes.find((x) => x.id === quoteId)
    if (!q || q.status !== 'open') return undefined
    q.status = 'accepted'
    q.acceptedAt = now()

    const order: Order = {
        id: nextId(s.seq, 'so'),
        quoteId: q.id,
        companyId: q.companyId,
        at: now(),
        eta: plus(45),
        status: 'capacity',
        stage: 0,
        items: q.items.map((i) => ({ ...i, done: 0, stage: 0, ship: '随整单', st: 'pending' as const })),
    }
    s.db.orders.push(order)

    order.items.forEach((it, i) => {
        const target = supTarget(s.rates, s.params, it)
        s.db.pkgs.push({
            id: nextId(s.seq, 'dp'),
            orderId: order.id,
            line: i,
            partName: it.name,
            rev: it.rev,
            mat: it.mat,
            surf: it.surf,
            qty: num(it.qty),
            target,
            total: +(target * num(it.qty)).toFixed(2),
            lead: q.lead,
            pay: `客户回款后 T+${s.params.payDays}`,
            at: now(),
            exp: plus(1),
            status: 'open',
            sup: null,
            watch: 0,
        })
    })
    return order
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

const LOCKED = (st: Pkg['status']) => st === 'taken' || st === 'done'

/** 所有包都抢到 → 产能确认通过，订单成立。 */
export const syncOrder = (s: MockState, orderId: string) => {
    const o = s.db.orders.find((x) => x.id === orderId)
    if (!o) return
    const ps = s.db.pkgs.filter((p) => p.orderId === orderId)
    ps.forEach((p) => {
        o.items[p.line].st = p.status
    })
    if (ps.every((p) => LOCKED(p.status)) && o.status === 'capacity') {
        o.status = 'confirmed'
        o.confirmedAt = now()
        o.stage = 1
    }
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
    const o = s.db.orders.find((x) => x.id === p.orderId)
    if (!o) return
    o.items[p.line].st = 'dropped'
    const live = s.db.pkgs.filter((x) => x.orderId === p.orderId && x.status !== 'dropped')
    if (live.length && live.every((x) => LOCKED(x.status)) && o.status === 'capacity') {
        o.status = 'confirmed'
        o.confirmedAt = now()
        o.stage = 1
    }
}

/** 调价重挂：目标价上浮 5% 重新挂池 */
export const repost = (s: MockState, pkgId: string) => {
    const p = s.db.pkgs.find((x) => x.id === pkgId)
    if (!p) return
    p.status = 'open'
    p.target = +(p.target * 1.05).toFixed(2)
    p.total = +(p.target * p.qty).toFixed(2)
    p.exp = plus(1)
    p.reprice = (p.reprice || 0) + 1
    syncOrder(s, p.orderId)
}

/* ── 生产上报 ─────────────────────────────────────────────────────── */

export const report = (s: MockState, pkgId: string, done: unknown) => {
    const p = s.db.pkgs.find((x) => x.id === pkgId)
    if (!p) return
    p.done = Math.min(num(done), p.qty)
    const o = s.db.orders.find((x) => x.id === p.orderId)
    if (!o) return
    const it = o.items[p.line]
    it.done = p.done
    it.stage = p.done >= p.qty ? 4 : p.done > 0 ? 1 : 0
    if (p.done >= p.qty) p.status = 'done'
    const all = s.db.pkgs.filter((x) => x.orderId === o.id && x.status !== 'dropped')
    o.stage = all.every((x) => x.status === 'done') ? 3 : all.some((x) => (x.done || 0) > 0) ? 1 : o.stage
}

export const deliver = (s: MockState, orderId: string) => {
    const o = s.db.orders.find((x) => x.id === orderId)
    if (!o) return
    o.status = 'delivered'
    o.stage = 4
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

export const saveRates = (
    s: MockState,
    rateInputs: Record<number, string>,
    paramInputs: Record<string, string>,
) => {
    s.rates.forEach((r, i) => {
        const v = rateInputs[i]
        if (v !== undefined && v !== '') r.rate = num(v)
    })
    ;(['margin', 'spread', 'fx', 'payDays', 'holdHours', 'grabHours'] as const).forEach((k) => {
        const v = paramInputs[k]
        if (v !== undefined && v !== '') s.params[k] = num(v)
    })
}

/* ── 供应商应付日 ─────────────────────────────────────────────────── */

/** 客户回款后 T+payDays。未回款返回 null —— 界面上显示「客户回款后 T+N」。 */
export const dueDate = (s: MockState, o: Order | undefined): string | null =>
    o && o.paidAt
        ? fmtDate(new Date(parseStamp(o.paidAt).getTime() + s.params.payDays * 864e5))
        : null
