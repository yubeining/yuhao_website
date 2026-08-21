/**
 * 原型数据仓的领域类型。
 *
 * ★ 这一层是**临时**的 —— 后端 domain/ 下 14 个业务包做完之后，
 *   这里的类型会被 services/ 里按接口生成的类型替代，整个 mock/ 目录删掉。
 *   在那之前它承担两件事：让原型可点，以及把字段名先固定下来。
 *
 * ★ 字段名一律 camelCase，和后端约定一致（CLAUDE.md §11 C1）——
 *   现在就对齐，将来换成真接口时页面不用改。
 */

/** 交易方类型。和后端 PartyType / 路由前缀三者对齐。 */
export type PartyKind = 'platform' | 'customer' | 'supplier' | 'both'

/** 用户在某家企业下的身份。一个用户可以同时是客户和供应商。 */
export type RoleName = 'customer' | 'supplier' | 'ops'

export interface RoleBinding {
    role: RoleName
    /** 所属企业 id */
    companyId: string
}

export interface Machine {
    type: string
    qty: string
    size: string
    prec: string
}

export interface Company {
    id: string
    name: string
    kind: PartyKind
    /** active = 已开通可抢单；review = 已交材料待考察 */
    status: 'active' | 'review'
    tier?: string
    /** 可抢品类范围 */
    scope?: string
    country?: string
    code?: string
    addr?: string
    factory?: string
    contact?: string
    phone?: string
    invTitle?: string
    taxNo?: string
    bank?: string
    acct?: string
    machines?: Machine[]
    cmm?: string
    report?: string
    at?: string
}

export interface User {
    id: string
    name: string
    mail: string
    pw: string
    verified: boolean
    roles: RoleBinding[]
}

export interface Invite {
    id: string
    name: string
    mail: string
    at: string
    exp: string
    used: boolean
}

/**
 * 清单行的状态。设计文档 9 §4.1。
 *
 *   ready    —— 字段齐全，可以报价
 *   pending  —— 缺版本 / 材料，**能导入但不能报价**，要补齐并经客户确认
 *   blocked  —— 缺图号 / 名称 / 数量，连导入都不行
 *
 * ★ 三档不是两档。原来只有「通过 / 阻断」，把版本和材料也算进阻断 ——
 *   而真实客户清单里这两列根本不存在（文档 9 §3），按那套规则一行都进不来。
 */
export type LineStat = 'ready' | 'pending' | 'blocked'

export interface RfqLine {
    /** 图号。客户自己的编号，不是我方内部编号 */
    no: string
    /** 零件名称。真实清单里有这一列，之前模型漏了 */
    name: string
    /**
     * 图纸版本。★ 客户清单里没有这一列 —— 真实来源是图纸文件名
     * （`模型_4_1_LB8.605.63529_A_(密级为空)_…` 里的 A）。见文档 9 §3.1。
     */
    rev: string
    /** 材料。★ 清单和文件名里都没有，只能看图填 + 客户确认。文档 9 §3.2 */
    mat: string
    qty: string | number
    surf: string
    /** 客户的批次号。原样存，不解析不校验。落 rfq_item.customer_task_no */
    taskNo?: string
    /** 客户的整机编号。零件固有属性，落 part.customer_system_no */
    systemNo?: string
    /** 客户的项目编号。零件固有属性，落 part.customer_topic_no */
    topicNo?: string
    /** 这个零件的图纸文件。一个零件多份图是常态，不是例外 */
    files: RfqFile[]
}

/**
 * 一个图纸文件。
 *
 * ★ 文件挂在**零件**下面，不挂在询价单下面。真实数据里一个零件平均 3 个文件
 *   （三维 .prt/.par + 二维 .pdf，有时加 .dft），58 个零件 185 个文件。
 *   之前把文件挂在询价单上、再用下标指回行，是把从属关系写反了。
 *
 * ★ 只存元数据。**文件本身没有上传到任何地方** —— 后端上传接口还没做。
 *   接上直传对象存储之后，这里加 fileObjectId 指向真实文件。
 *   在那之前不要让界面表现得像文件已经存下来了。
 */
export interface RfqFile {
    name: string
    size: number
    /** 从文件名解析出的版本号 */
    revFromName: string
}

export interface Rfq {
    id: string
    companyId: string
    at: string
    want: string
    /**
     * 零件。真实业务里零件是原子，清单只是它的汇总。
     *
     * ★ 图纸文件挂在零件里（`RfqLine.files`），**询价单这一层不持有任何文件**。
     *   曾经在这里放过一个「未认领文件」的桶 —— 那等于承认图纸可以脱离零件存在，
     *   而业务上不存在这种东西：一份图纸必然是某个零件的图纸。
     *   认不出图号的文件当场变成一个待填图号的零件，不另开一个筐。
     */
    lines: RfqLine[]
    /** draft = 还有行没补齐，未出报价；quoting = 已出报价 */
    status: 'draft' | 'quoting'
    stage: number
    quoteId?: string
}

export interface QuoteItem extends RfqLine {
    /** 对客单价（€/件） */
    unit: number
    /** 小计（€） */
    total: number
}

export interface Quote {
    id: string
    rfqId: string
    companyId: string
    at: string
    items: QuoteItem[]
    total: number
    lead: string
    valid: string
    inco: string
    status: 'open' | 'accepted' | 'expired'
    acceptedAt?: string
}

/** 订单行的履约状态。和派单包的 status 同步（syncOrder）。 */
export type OrderItemStat = 'pending' | 'open' | 'taken' | 'done' | 'dropped'

export interface OrderItem extends QuoteItem {
    done: number
    stage: number
    ship: string
    st: OrderItemStat
}

export interface Order {
    id: string
    quoteId: string
    companyId: string
    at: string
    eta: string
    status: 'capacity' | 'confirmed' | 'delivered'
    stage: number
    items: OrderItem[]
    confirmedAt?: string
    deliveredAt?: string
    /** 客户回款时间。背靠背结算的起算点。 */
    paidAt?: string
}

/**
 * 派单包 —— 订单的一行拆出来独立挂到抢单大厅。
 *
 * ★ 一行一个包，各自独立抢单、独立成败：某一行无人接单退回，
 *   不影响同一订单的其他行（dropLine）。
 */
export interface Pkg {
    id: string
    /** 所属订单 id */
    orderId: string
    /** 在订单 items 里的下标。要查客户图号从这里回溯到订单行，不在包里存 */
    line: number
    /**
     * ★ 零件名称，**不是客户图号**。
     *
     *   抢单大厅对所有已入驻供应商开放，包括还没签这一单的人。
     *   客户图号是客户自己的编码体系（真实样本形如 LB8.610.63493），
     *   把它挂在大厅上等于把客户的产品结构公开 —— 同行看编号段就能
     *   反推出他在做什么产品线。文档 7 §8 明确要求寻源包脱敏。
     *
     *   内部要看图号，从 orderId + line 回溯订单行。
     */
    partName: string
    rev: string
    mat: string
    surf: string
    qty: number
    /** 给供应商的目标价（¥/件），不可议价 */
    target: number
    total: number
    lead: string
    pay: string
    at: string
    exp: string
    status: 'open' | 'taken' | 'done' | 'dropped'
    /** 抢到的供应商企业 id */
    sup: string | null
    watch: number
    tookAt?: string
    contractId?: string
    done?: number
    reprice?: number
    invoice?: boolean
    delivered?: string
}

export interface Contract {
    id: string
    pkgId: string
    sup: string
    at: string
    amount: number
    status: 'unsigned' | 'signed'
    signedAt?: string
}

export interface Invoice {
    id: string
    pkgId: string
    sup: string
    no: string
    at: string
    status: 'checking' | 'ok'
}

export interface Db {
    companies: Company[]
    users: User[]
    invites: Invite[]
    rfqs: Rfq[]
    quotes: Quote[]
    orders: Order[]
    pkgs: Pkg[]
    contracts: Contract[]
    invoices: Invoice[]
}

/** id 序列号。持久化时一起存，否则刷新后会发出重复单号。 */
export interface Seq {
    rfq: number
    qt: number
    so: number
    dp: number
    ct: number
    po: number
    inv: number
    cid: number
    uid: number
    iv: number
}
