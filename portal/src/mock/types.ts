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
    /** 一次性：用过即失效。有效期没人定过，所以没有这个字段。 */
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

/**
 * 一份图纸文件。挂在零件上，跟着零件走。
 *
 * ★ 只存元数据。**文件本身没有上传到任何地方** —— 后端上传接口还没做。
 */
export interface RfqFile {
    name: string
    size: number
    /** 从文件名解析出的版本号 */
    revFromName: string
}


/**
 * 订单里的一个零件。
 *
 * ★ 零件建在订单里面，跟着订单走。图纸又挂在零件上。
 *   三层从属关系：订单 → 零件 → 图纸。
 */
export interface OrderPart {
    id: string
    /** 图号。多数情况从图纸文件名读出来 */
    no: string
    name: string
    /**
     * 版本号。**我方生成，从 1 开始，客户不填。**
     *
     * ★ 版本是一个事实，不是一项申报 —— 客户重新传了图纸，就是新的一版。
     *   让客户自己填版本号，等于让他去维护一件他本来就没在维护的事：
     *   真实样本里 58 个零件只有 33 个的文件名带版本字母，剩下的他根本没写。
     *
     * ★ 什么时候递增：**这个零件的图纸在被报价之后又变了**。
     *   报价前反复改图只是还没定稿，不算改版；报价之后改图会让已发出的报价失效，
     *   那才是必须留痕的时刻。
     */
    version: number
    /**
     * 客户自己的版本标记（A / B / C），从图纸文件名读出来，**只展示不参与判断**。
     * 他有就记下来，方便双方对话时说「按 B 版做」；没有也不影响任何事。
     */
    customerRev: string
    /** 材料。★ 客户清单里没有这一列，我方看图补齐后客户确认（设计文档 9 §4.2） */
    mat: string
    surf: string
    qty: string | number
    /** 客户自己的三个编号。原样存，不解析不校验 */
    taskNo?: string
    systemNo?: string
    topicNo?: string
    files: RfqFile[]

    /* ── 报价之后才有 ─────────────────────────────────────────── */
    /** 对客单价（€/件） */
    unit?: number
    total?: number

    /* ── 发布之后才有 ─────────────────────────────────────────── */
    /** 执行状态。发布之后才有；未发布时为空。退回的零件也置空并单独标记。 */
    st?: PartExecStatus
    /** 无人接单被退回 */
    dropped?: boolean
    /** 已完成件数。供应商上报的唯一生产信号 —— 没有工序级进度。 */
    done?: number
}

/**
 * 订单。**整条链的主干。**
 *
 * ★ 客户先建订单，再往里加零件，然后整单发布。
 *   订单不是报价被接受之后才产生的东西 —— 它从一开始就在，
 *   后面发生的每一件事都是它的状态推进：
 *
 *     draft       草稿中     建零件中，还没发布
 *     pricing     待估价     已发布订单，正在估价（要解析几何、算工时，不是即时的）
 *     quoted      已估价     价格出来了，等客户确认
 *     toPublish   待发布     客户已确认价格，等发布到订单市场
 *     published   已发布     已挂上订单市场，等供应商接单
 *     taken       已接单     全部零件被抢到**并签了合同**
 *     toProduce   待生产     供应商确认排产，还没开工
 *     producing   生产中     开始报完成量
 *     produced    生产完成   全部零件报满
 *     shipping    物流配送中 已发货
 *
 * ★★ 两个「发布」是两回事，不要混：
 *     「发布订单」 —— 离开草稿，进入估价（客户动作）
 *     「发布到订单市场」 —— 放给供应商看（客户动作，在价格确认之后）
 *   界面上按钮分别叫「发布订单」和「发布到订单市场」，状态里只有一个「已发布」。
 */
export type OrderStatus =
    | 'draft' | 'pricing' | 'quoted' | 'toPublish' | 'published'
    | 'taken' | 'toProduce' | 'producing' | 'produced' | 'shipping'

/**
 * 零件的执行状态。**只有四个** —— 零件层面不需要订单那套完整流程。
 *
 *     waiting   待接单     已发布，还没有供应商接
 *     taken     已接单     被抢到并签了合同
 *     producing 生产中     开始报完成量
 *     produced  生产完成   报满
 */
export type PartExecStatus = 'waiting' | 'taken' | 'producing' | 'produced'

export interface Order {
    id: string
    companyId: string
    /** 客户给这一单起的名字，方便他自己认 */
    title: string
    status: OrderStatus
    parts: OrderPart[]
    at: string
    /** 交期要求（天） */
    want: string
    /** 当前有效的报价 */
    quoteId?: string
    submittedAt?: string
    quotedAt?: string
    confirmedAt?: string
    publishedAt?: string
    takenAt?: string
    scheduledAt?: string
    deliveredAt?: string
    /** 客户回款时间。背靠背结算的起算点 */
    paidAt?: string
}

/**
 * 报价单。订单的子记录。
 *
 * ★ 报价行是**快照**：订单里的零件之后改了名或改了材料，
 *   已发出的报价单内容不能跟着变（CLAUDE.md §10 C2）。
 */
export interface QuoteItem {
    partId: string
    no: string
    name: string
    /** 报的是这个零件的第几版。之后零件改版，这张报价单指向的仍是当时那一版 */
    version: number
    customerRev: string
    mat: string
    surf: string
    qty: string | number
    unit: number
    total: number
    /** 供应商目标价快照（¥/件）。估价时和对客价一起算死，发布派单包用它，不回头读参数 */
    target: number
}

export interface Quote {
    id: string
    orderId: string
    companyId: string
    at: string
    items: QuoteItem[]
    total: number
    /** 客户在订单里填的交期要求。不是我方承诺的交期 —— 交期要等供应商排产才知道。 */
    wantLead: string
    inco: string
    /** 有效期至。天数用平台参数 validDays（默认 15，文档 5 Q6），报价强制有效期是文档 3 护栏 1 */
    valid: string
    /** 估价时的汇率快照（文档 3 护栏 4）。内部算毛利用它，不读当前参数 */
    fx: number
    /** 只有这两个 —— 谢绝之后订单怎么走还没定，没定就不先摆一个状态名 */
    status: 'open' | 'accepted'
    acceptedAt?: string
}

/**
 * 派单包 —— 订单的一行拆出来独立挂到订单市场。
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
     *   订单市场对所有已入驻供应商开放，包括还没签这一单的人。
     *   客户图号是客户自己的编码体系（真实样本形如 LB8.610.63493），
     *   把它挂在市场上等于把客户的产品结构公开 —— 同行看编号段就能
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
    /** 客户要求的交期。派单包上写明它是客户的要求，不是我方给供应商的承诺 */
    wantLead: string
    pay: string
    at: string
    /** 抢单截止时刻（发布时刻 + grabHours） */
    exp: string
    status: 'open' | 'taken' | 'done' | 'dropped'
    /** 抢到的供应商企业 id */
    sup: string | null
    watch: number
    /** 供应商已确认排产 */
    scheduled?: boolean
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
    orders: Order[]
    quotes: Quote[]
    pkgs: Pkg[]
    contracts: Contract[]
    invoices: Invoice[]
}

/** id 序列号。持久化时一起存，否则刷新后会发出重复单号。 */
export interface Seq {
    so: number
    pt: number
    qt: number
    dp: number
    ct: number
    inv: number
    cid: number
    uid: number
    iv: number
}
