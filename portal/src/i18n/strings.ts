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

// Lang 的真源在 lang.ts（那里还带着判定逻辑），这里只做转出，避免两处定义
import type { Lang } from './lang'
export type { Lang }

export interface Strings {
    roles: Record<'customer' | 'supplier' | 'ops', string>
    /**
     * 跨页面复用的通用文案。
     * 加之前先问：这东西真的到处都用吗？只在一处用的，别放这儿。
     */
    common: {
        /** 原型页横幅。每个页面接上后端后，这块整段删除。 */
        prototypeTitle: string
        prototypeBody: string
        unitPieces: string
        decrease: string
        increase: string
        noDrawings: string
        openInCad: string
        /** 参数化文案用函数，不要用字符串拼接 —— 语序在不同语言里不一样 */
        fileCount: (n: number) => string
        /** 兜底的失败提示。具体错误码优先走 t.errors。 */
        actionFailed: string
        loading: string
        retry: string
        cancel: string; save: string; edit: string; close: string; openInNewTab: string; required: string
        /** 通用确认弹框的确认按钮 */
        ok: string
        /** 带筛选条件的列表查不到东西时 —— 和「还没有任何 xx」区分开 */
        noMatch: string
        /** 自动保存后的轻提示 */
        saved: string
        prevPage: string; nextPage: string
        pageTotal: (n: number) => string; pageOf: (page: number, pages: number) => string
        create: string
        untitledOrder: string
        /** 表格列头。同一列在多个页面出现，必须同一套说法。 */
        table: {
            name: string; parts: string; quantity: string; created: string; status: string
            order: string; totalPrice: string; price: string; leadTime: string; quotedAt: string
        }
    }
    /** 客户端页面 */
    customer: {
        orders: {
            title: string; sub: string; count: (n: number) => string
            newOrder: string; newTitle: string; titlePlaceholder: string
            deleteOrder: string; deleteConfirm: string; confirmQuote: string
            empty: string; emptySub: string
        }
        orderDetail: {
            notFound: string; backToOrders: string; addPart: string; addFirstPart: string
            missingDrawingBanner: (n: number) => string; submittedBanner: string
            quotedBanner: string; cancelledBanner: string
            statusSubmitted: string; statusQuoted: (amount: string, commitDate: string) => string
            statusConfirmed: string; statusReady: string
            statusViewQuotes: string; statusConfirmQuote: string; statusQuoteDetail: string
            infoTitle: string; fldName: string; fldLead: string; needWantedDate: string
            fldParts: string; fldTotalQty: string; fldCreated: string; fldSubmitted: string
            partsTitle: (n: number) => string; missingDrawingPill: (n: number) => string
            colRevision: string; colMaterial: string; colDrawing: string; colProgress: string
            colCode: string; colQty: string
            customerRev: (v: string) => string; drawingUploaded: string; drawingMissing: string
            remove: string; confirmRemoveLine: (code: string) => string; emptyParts: string; emptyPartsSub: string
            submit: string; submitConfirmTitle: string; submitConfirmBody: string; submitConfirmCta: string
            needDrawings: (n: number) => string; needCompany: string; fillCompany: string
            /** 一个零件都没有时的提交按钮文案 */
            needParts: string
        }
        partForm: {
            uploadFailed: string; errRequired: string; notFound: string
            titleNew: string; titleEdit: string; titlePart: string
            lockedBanner: string
            reuseExisting: (name: string, files: number) => string
            reuseNewVersionQueued: string; reuseNewVersion: (name: string) => string
            infoTitle: string
            fldCode: string; codeHint: string
            fldMaterial: string; fldSurface: string
            drawingTitle: string; drawingMissing: string
            drawingUploadedCount: (n: number) => string; drawingQueuedCount: (n: number) => string
            lockedPill: string
            chooseDrawing: string; replaceDrawing: string
            download: string; removeTitle: string; confirmRemoveFile: (name: string) => string; preview: string; previewUnsupported: string
            cancel: string; backToOrder: string; discardConfirm: string
            addToOrder: string; addHint: string; saveEdit: string
        }
        quotes: {
            title: string
            detailTitle: string; partsHeader: (n: number) => string
            colCode: string; colQty: string; colUnit: string; colSubtotal: string; total: string
            reject: string; confirmPrice: (amount: string) => string; fldRateDate: string
            empty: string
            emptySub: string
            pendingSection: (n: number) => string; quoteSection: (n: number) => string; awaiting: string
            noQuote: string
            noQuoteSub: string
            viewOrder: string
            locked: (rateDate: string) => string
            floating: (rateDate: string) => string
            noRate: string
            rejectConfirm: string
            confirmTitle: string
            confirmBody: (total: string, commitDate: string) => string
            confirmCta: string
            rateNote: (rateDate: string) => string
            rejected: string
            confirmedAt: (when: string, rateDate: string) => string
            infoTitle: string
            fldCurrency: string
            fldLeadTime: string
            fldQuotedAt: string
        }
    }
    /**
     * 品牌侧的四步流程图：只有步骤名。
     * ★ 2026-09-18 删掉了每步的说明（「解析后当场给价」「供应商接单，成本锁定」等）—— 和实际不符，报价是人工的。
     */
    flow: string[]
    login: {
        h: string; sub: string; subA: string
        email: string; pw: string; forgot: string; submit: string; or: string
        wx: string
        /** 两种登录方式 */
        modePassword: string; modeCode: string
        sendCode: string; codeSentTo: string; codeLabel: string
        backToEmail: string; resend: string; resendIn: (seconds: number) => string
        codeHint: string; needsRegistration: string
    }
    /** 忘记密码（2026-11-23）。只有客户 / 供应商登录页有入口。 */
    forgotPw: {
        h: string; back: string
        email: string; sendCode: string; codeSentHint: string
        code: string; newPw: string; confirmPw: string; mismatch: string; passwordRule: string
        submit: string; resend: string; resendIn: (seconds: number) => string
    }
    reg: {
        h: string; sub: string; subA: string
        email: string; code: string
        sendCode: string; resend: string; resendIn: (seconds: number) => string
        codeSentTo: (email: string) => string
        hint: string
        submit: string
        /** 本地校验提示（后端没这几种） */
        errRequired: string; errCode: string; errCompany: string
        company: string; companyHint: string
        errTaken: string; errFailed: string
        otherCountry: string
    }
    /** 内部（运营）登录。独立入口，和外部登录不共用文案。 */
    opsLogin: {
        brand: string; h: string
        email: string; pw: string; submit: string
        badCredentials: string; failed: string
    }
    /** 订单 / 零件 / 报价的状态文案。★ 以后端枚举名为 key，不要自己起名。 */
    status: {
        order: Record<'DRAFT' | 'SUBMITTED' | 'QUOTED' | 'CONFIRMED' | 'READY' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED', string>
        line: Record<'PENDING' | 'IN_PROGRESS' | 'FULFILLED' | 'CANCELLED', string>
        quote: Record<'SENT' | 'SUPERSEDED' | 'REJECTED' | 'CONFIRMED', string>
    }
    /** 供应商端页面 */
    supplier: {
        hall: {
            title: string; availableTitle: string; available: (n: number) => string
            colSource: string; colLines: string; colQty: string; colTotal: string
            colDue: string; colDispatched: string
            targeted: string; openMarket: string
            empty: string; emptySub: string
        }
        hallDetail: {
            back: string; title: string
            gone: string; goneSub: string
            acceptConfirm: (price: string, date: string) => string
            declineConfirm: string
            summaryTitle: string; fldDue: string; fldTotal: string; fldDispatched: string
            note: string; partsTitle: (n: number) => string
            colMaterialSurface: string; colUnitPrice: string; colSubtotal: string; colDrawing: string
            decline: string; accept: string
        }
        orders: {
            title: string; empty: string; emptySub: string
            cardTitle: (id: string) => string
            fldDue: string; fldTotal: string; fldAccepted: string
            fldSigned: string; fldSignDeadline: string; signDeadlineNote: (when: string) => string
            fldCancel: string
            reworkLine: string
            start: string; produced: string
            startConfirm: string; producedConfirm: string
            awaitingContract: string; withdraw: string
            signNote: string; signConfirm: string
            waitingSignConfirm: (total: string, due: string) => string
            withdrawConfirm: string; shipConfirm: string
            unfinished: (n: number) => string; readyToShip: (n: number) => string; shipped: string
            ship: string
            allFulfilled: string
        }
        bill: {
            title: string
            kpiCompleted: string; kpiCompletedSub: (n: number) => string
            kpiPending: string; kpiPendingSub: string
            kpiToInvoice: string; kpiToInvoiceSub: string
            cardSub: (lines: number, amount: string) => string
            uploaded: string; toInvoice: string
            colAmount: string; colPaid: string; colDue: string; colShipped: string
            pendingPayment: string
            dueAfter: (days: number) => string; dueAfterPayment: string
            invoiceNote: (amount: string) => string
            invoiceNoPlaceholder: string; upload: string
            empty: string
        }
        profile: {
            title: string; noData: string; note: string; inspecting: string
            equipmentTitle: string; colEquipType: string; colMaxSize: string; colPrecision: string
            infoTitle: string; orgName: string; uscc: string; contactPhone: string
            invoiceTitle: string; bankAccount: string
        }
    }
    /** 派单域状态（运营端和供应商端共用）。★ 以后端枚举名为 key。 */
    dispatch: {
        opsOrder: Record<'ASSEMBLING' | 'OFFERED' | 'PUBLISHED' | 'ASSIGNED' | 'FULFILLED', string>
        mode: Record<'TARGETED' | 'MARKET', string>
        offer: Record<'OFFERED' | 'DECLINED' | 'REVOKED', string>
        supplierOrder: Record<'ACCEPTED' | 'CONTRACT_PENDING' | 'CONTRACTED' | 'IN_PRODUCTION' | 'SHIPPED' | 'FULFILLED' | 'CANCELLED', string>
        line: Record<'PENDING' | 'IN_PRODUCTION' | 'PRODUCED' | 'QC_PENDING' | 'QC_PASSED' | 'SUPERSEDED' | 'SCRAPPED' | 'CANCELLED', string>
        cancelReason: Record<'WITHDRAWN' | 'REVOKED' | 'SIGN_TIMEOUT', string>
    }
    /** 日期选择器。只有「选择 / 清除 / 今天」三个词，其他都靠浏览器本地化。 */
    datePicker: { placeholder: string; clear: string; today: string }
    /** 个人资料页。只有昵称可改，其余只读。 */
    account: { title: string; preferences: string; language: string }
    profile: {
        title: string; basic: string; nickname: string; email: string; role: string
        joined: string; edit: string; save: string; cancel: string; saved: string
        company: string; country: string; companyMissing: string; companyFill: string
        /** 改密码（2026-11-23）：邮件验证码 + 新密码，成功后所有设备都要重新登录 */
        password: string; changePassword: string; passwordHint: string
        sendCode: string; resend: string; resendIn: (seconds: number) => string
        codeSentTo: (email: string) => string
        code: string; newPw: string; confirmPw: string; mismatch: string; passwordRule: string
    }
    /** 通用页面（404 / 设置） */
    misc: {
        notFoundTitle: string; notFoundSub: string; backHome: string
        settings: string; appearance: string; light: string; dark: string
        /** 注册时不收公司名，在设置里补（docs/design/14 §4）。 */
    }
    /** 导航与外壳。三端共用，所以按端分组，不要混成一锅。 */
    nav: {
        settings: string; signOut: string
        /** 手机上展开侧栏抽屉的按钮（无障碍名称） */
        menu: string
        defaultUser: string; supplierFallback: string
        customer: { orders: string; quotes: string }
        supplier: {
            accept: string; orders: string; settlement: string; bill: string
            company: string; profile: string; hall: string; workspace: string
        }
        ops: {
            business: string; quotes: string; suppliers: string
            dispatch: string; production: string; quoteSettings: string; costRates: string
            masterData: string; accounts: string; internalOps: string
        }
    }
    /** 运营后台 */
    ops: {
        orders: {
            title: string; colCustomer: string; colCreated: string; colProd: string
            colProgress: string; colPaid: string; unscheduled: string
            paid: string; unpaid: string; markDelivered: string; registerPayment: string
            empty: string
        }
        quotes: {
            title: string; filterAll: string; tabSubmitted: string; tabQuoted: string; tabConfirmed: string
            orderCount: (n: number) => string
            colQty: string; colLead: string; colSubmitted: string; colQuote: string
            leadDays: (n: number) => string; never: string; empty: string
        }
        production: {
            title: string; sub: string; empty: string; emptySub: string
            cardTitle: (id: string) => string
            fldSupplier: string; fldOpsOrder: string; fldDue: string; fldSignedAt: string
            colCustomer: string; colQc: string; reworkLine: string
            phPass: string; phRework: string; phScrap: string; submit: string
            remade: string; remake: string
            sumMismatch: (qty: number, sum: number) => string
            confirmQc: (pass: number, rework: number, scrap: number) => string
        }
        parties: {
            title: string; suppliers: string; supplierCount: (n: number) => string
            colCompany: string; colDiscount: string; colProcess: string; colMaterial: string
            colSize: string; colPrecision: string; colDispatchable: string; colOnboarded: string
            disabled: string; notSet: string; canDispatch: string; missingDiscount: string
            edit: string; empty: string
            editTitle: (name: string) => string
            fldDiscount: string; discountPlaceholder: string
            fldProcess: string; fldMaterial: string; fldSize: string; fldPrecision: string
            freeText: string; discountHint: string; saved: (name: string) => string
            errDiscount: string; errDiscountRequired: string; save: string
        }
        accounts: {
            title: string
            tabUsers: string; tabOrgs: string; tabStaff: string
            search: string; query: string
            colEmail: string; colName: string; colOrg: string; colType: string
            colStatus: string; colVerified: string; colCreated: string; colCountry: string
            colDept: string
            statusActive: string; statusDisabled: string
            typeCustomer: string; typeSupplier: string; typeInternal: string
            verified: string; unverified: string
            create: string; edit: string; disable: string; enable: string
            save: string; cancel: string
            newUser: string; editUser: string; newOrg: string; editOrg: string
            newStaff: string; editStaff: string
            fldOrg: string; fldEmail: string; fldName: string; fldPassword: string
            fldCountry: string; fldType: string
            fldMarkup: string; fldMarkupHint: string; markupUnset: string
            markupOwn: (rate: number) => string; markupDefault: (rate: number) => string
            immutable: string; immutableType: string; passwordRule: string
            all: string; selectPlaceholder: string
            usersTotal: (n: number) => string
            orgsTotal: (n: number) => string
            staffTotal: (n: number) => string
            noUsers: string; noOrgs: string; noStaff: string
            staffOrgHint: string
            confirmDisableUser: (email: string) => string
            confirmDisableOrg: (name: string) => string
            confirmDisableStaff: (email: string) => string
            created: string; saved: string
            disabledOk: (who: string) => string
            enabledOk: (who: string) => string
        }

        dispatchPage: {
            title: string; newOpsOrder: string; created: (id: string) => string
            poolTitle: string; poolCount: (n: number) => string
            colCustomerOrder: string; colMaterialSurface: string; colSubmitted: string
            allocate: string; poolEmpty: string; poolEmptySub: string
            pickTitle: (code: string, name: string, qty: number) => string
            colOpsOrder: string; colExistingLines: string; colSplitQty: string
            unitPieces: string; noAssembling: string; noAssemblingSub: string
            splitNote: (qty: number, sum: number) => string
            cancel: string; confirmAllocate: string
            ordersTitle: string; orderCount: (n: number) => string
            colNo: string; colMode: string; colLines: string; colPieces: string
            colCustomers: string; colSupplierDue: string; colAcceptedBy: string; colBuilt: string
            ordersEmpty: string
            errInteger: string; errSplitMismatch: (qty: number, sum: number) => string
            allocated: (code: string, orders: number) => string
        }
    }
        quoteWork: {
            back: string; title: string; notFound: string; notFoundSub: string
            errCurrency: string; errCommitDate: string; errPrice: (code: string) => string
            confirmResend: string; confirmSend: string
            sent: string
            lockedBanner: string; cancelledBanner: string
            quoteTitle: string; requoteTitle: string
            colPart: string; colMaterial: string; colSurface: string; colBasePrice: string
            context: (customer: string, wanted: string, qty: number) => string
            lblMarkup: string; lblCurrency: string; lblCommitDate: string
            markupUnset: string
            customerRev: (v: string) => string
            needMarkup: string
            /** 原价口径提示（2026-11-24 需求方定：原价是标准价，不是成本） */
            basePriceHint: string
            resendBtn: string; sendBtn: string
            historyTitle: string
            colVersion: string; colCurrency: string; colLead: string; colMarkup: string
            colTotal: string; colRate: string; colSentAt: string
            markupTimes: (v: number) => string
            rateLocked: string; rateUnlocked: string; empty: string
        }
        quoteSettings: {
            title: string; sub: string
            defaultTitle: string; defaultHint: string; defaultSaved: string; defaultUnset: string
            companiesTitle: string; companyCount: (n: number) => string
            colCompany: string; colRate: string
            usingDefault: string; ownValue: string; manageCompanies: string
            empty: string; emptySub: string
        }
        /** AI 成本估算（报价工作台里的一块，2026-11-17） */
        estimate: {
            title: string; sub: string
            colCost: string; colResult: string; colAt: string
            run: string; rerun: string; running: string; details: string
            /** 估价进行中，按钮上带已等待秒数 */
            runningFor: (sec: number) => string
            stComplete: string; stIncomplete: string; stNotMachined: string
            modalTitle: (code: string) => string
            kind: Record<string, string>; unit: Record<string, string>
            colKind: string; colItem: string; colQty: string; colUnitPrice: string; colFactor: string; colAmount: string
            missingRate: string; missingQty: string; fixedMissing: string; aiEstimated: string
            total: string; incompleteHint: string
            partType: string; material: string; weight: (net: string, blank: string) => string
            assumptions: string; toConfirm: string; files: string; skipped: string; model: string
        }
        /** 费率表（AI 成本估算按它算钱） */
        costRates: {
            title: string; sub: string
            create: string; edit: string; del: string; cancel: string; save: string
            colKind: string; colName: string; colUnit: string; colPrice: string; colNote: string; colUpdated: string
            kind: Record<string, string>; unit: Record<string, string>
            all: string
            newTitle: string; editTitle: string
            errName: string; errPrice: string
            confirmDelete: (name: string) => string
            saved: string; created: string; deleted: (name: string) => string
            empty: string
        }
    /** 订单收货地址（2026-11-23）：客户订单详情可编辑，运营订单详情只读 */
    shipTo: {
        title: string; fill: string; edit: string; empty: string; need: string
        country: string; company: string; contact: string; phone: string; phoneHint: string
        line1: string; line2: string; city: string; region: string; postalCode: string
        cancel: string; save: string; requiredMissing: string; lockedNote: string
    }
    /** 收货地址簿（2026-11-26）：客户在账号设置里维护，下单时选；运营只读。表单字段名复用 shipTo */
    addressBook: {
        title: string; add: string; edit: string; del: string; setDefault: string; defaultTag: string
        copy: string; copied: string; copyFailed: string
        empty: string; newTitle: string; editTitle: string; makeDefault: string
        deleteTitle: string; deleteBody: string; deleted: string; madeDefault: string
        paste: string; pasteHint: string; pasteRun: string; pasteDone: string; pasteNothing: string
        pickTitle: string; use: string; manage: string; pickEmpty: string
        opsButton: string; opsTitle: (name: string) => string; opsEmpty: string
    }
    /** 派单详情（生产订单） */
    prodDetail: {
        back: string; title: string; notFound: string
        dueProblem: string; errNoSupplier: string
        confirmOffer: (n: number) => string; offered: string
        confirmPublish: string; published: string
        confirmRecall: string; recalled: string
        confirmCreateContract: string; contractCreated: string; confirmCancelContract: string; contractCancelled: string
        confirmRevokeSupplier: (name: string) => string; revokedSupplier: string
        confirmUnallocate: (code: string) => string; unallocated: (code: string) => string
        summaryTitle: string; fldLines: string; fldTotalQty: string; fldMode: string
        fldDue: string; fldDispatched: string; fldSupplier: string
        partsTitle: string; colCustomerOrder: string; colMaterialSurface: string; colPieces: string
        unallocate: string
        emptyParts: string; emptyPartsSub: string; deleteEmpty: string
        priceTitle: string; colSupplier: string; colDiscount: string; colSupplierTotal: string
        noSupplierAvailable: string; noSupplierAvailableSub: string
        offerDueLabel: string
        publishBtn: string; offerSelected: (n: number) => string
        offersOpen: string; offersAccepted: string
        colOfferedTo: string; marketNote: string
        acceptedNote: (name: string, when: string, due: string) => string
        awaitingContract: (deadline: string) => string
        awaitingSignature: (created: string, deadline: string) => string
        signedNote: (when: string) => string
        createContract: string; dropContract: string; recall: string
        revokeSupplier: string; ship: string; cancelHistory: string
        colReason: string; colAcceptedAt: string; colCancelledAt: string
    }
    /** 发货（2026-11-24）：运营发给客户、随货文件、客户确认收货、供应商发给平台的承运商 / 运单号 */
    shipping: {
        title: string; carrier: string; trackingNo: string; shippedAt: string; receivedAt: string
        shipBtn: string; shipModalTitle: string; shipSubmit: string; needBoth: string; shipped: string
        docsTitle: string; docsHint: string; docsEmpty: string; upload: string; uploading: string
        uploaded: (name: string) => string; download: string
        customerShipped: string; confirmReceipt: string; confirmReceiptTitle: string; confirmReceiptBody: string
        customerCompleted: (when: string) => string
        supplierShipTitle: string; supplierShipSubmit: string; batches: string
        batch: (carrier: string, trackingNo: string, when: string) => string
    }
    /** 后端返回的 i18n code → 文案。后端只返 code（CLAUDE.md §6），翻译全在这里。 */
    errors: Record<string, string>
}

export const STRINGS: Record<Lang, Strings> = {
    zh: {
        roles: { customer: '客户', supplier: '供应商', ops: '内部' },
        common: {
            prototypeTitle: '原型页，还没接真实数据。',
            prototypeBody: '这里显示的列表、数字、设置都不是线上数据，不要据此做决定。',
            unitPieces: '件',
            decrease: '减少',
            increase: '增加',
            noDrawings: '暂无图纸',
            openInCad: '下载后用本地 CAD 软件打开',
            fileCount: (n) => `共 ${n} 个文件`,
            actionFailed: '操作失败，请重试',
            loading: '加载中…', retry: '重试', cancel: '取消', ok: '确定', noMatch: '没有匹配的结果', create: '创建', save: '保存', edit: '编辑', saved: '已保存', close: '关闭', openInNewTab: '新窗口打开', required: '必填',
            prevPage: '上一页', nextPage: '下一页',
            pageTotal: (n) => `共 ${n} 条`, pageOf: (page, pages) => `第 ${page} / ${pages} 页`,
            untitledOrder: '未命名订单',
            table: {
                name: '名称', parts: '零件', quantity: '总件数', created: '建单', status: '状态',
                order: '订单', totalPrice: '总价', price: '价格', leadTime: '交期', quotedAt: '报价时间',
            },
        },
        customer: {
            orders: {
                title: '我的订单',
                sub: '录入零件、传好图纸后提交',
                count: (n) => `共 ${n} 单`,
                newOrder: '＋ 新建订单', newTitle: '新建订单',
                titlePlaceholder: '订单名称（可选）',
                deleteOrder: '删除',
                deleteConfirm: '删除这张草稿？订单里的图纸也会一并删除，不能恢复。',
                confirmQuote: '确认报价 ›',
                empty: '暂无订单', emptySub: '新建订单后录入零件',
            },
        orderDetail: {
            notFound: '订单不存在', backToOrders: '← 我的订单',
            addPart: '＋ 添加零件', addFirstPart: '＋ 添加零件',
            missingDrawingBanner: (n) => `${n} 个零件还没传图纸，传齐后才能提交。`,
            submittedBanner: '订单已提交，各零件的图纸版本已锁定，不能再修改。',
            quotedBanner: '平台已报价，等你确认。', cancelledBanner: '订单已取消。',
            statusSubmitted: '运营正在核价，报价出来后可在「我的报价」确认。',
            statusQuoted: (amount, commitDate) => `报价已出 ${amount}（按确认当日汇率锁价）· 承诺交期 ${commitDate}`,
            statusConfirmed: '已确认报价。',
            statusReady: '全部零件已完工。',
            statusViewQuotes: '我的报价 →', statusConfirmQuote: '查看并确认报价', statusQuoteDetail: '报价明细 →',
            infoTitle: '订单信息',
            fldName: '名称', fldLead: '期望交货日期', needWantedDate: '请先填期望交货日期',
            fldParts: '零件数', fldTotalQty: '总件数', fldCreated: '建单日期', fldSubmitted: '提交时间',
            partsTitle: (n) => `零件 ${n} 个`, missingDrawingPill: (n) => `${n} 缺图纸`,
            colRevision: '版本', colMaterial: '材料', colDrawing: '图纸', colProgress: '进度',
            colCode: '图号', colQty: '数量',
            customerRev: (v) => `客户标记 ${v}`,
            drawingUploaded: '图纸已传', drawingMissing: '缺图纸', remove: '删除',
            confirmRemoveLine: (code) => `删除零件「${code}」？这一行的图纸会一起移除。`,
            emptyParts: '暂无零件', emptyPartsSub: '录入零件并传好图纸后提交',
            submit: '提交订单',
            submitConfirmTitle: '确认提交订单？',
            submitConfirmBody: '提交后各零件的图纸版本会被锁定，不能再修改或更换图纸。',
            submitConfirmCta: '确认提交',
            needDrawings: (n) => `还有 ${n} 个零件缺图纸`,
            needParts: '先添加至少一个零件',
            needCompany: '提交前还需补全公司名称，它会显示在报价单与合同上。',
            fillCompany: '填写公司名称',
        },
        partForm: {
            uploadFailed: '上传失败',
            errRequired: '图号、名称、数量为必填项，数量至少为 1',
            notFound: '零件不存在',
            titleNew: '添加零件', titleEdit: '编辑零件', titlePart: '零件',
            lockedBanner: '订单已提交或已取消，不能再添加零件。',
            reuseExisting: (name, files) => `已有零件「${name}」：加进订单后沿用上次提交的图纸（${files} 个文件）。`,
            reuseNewVersionQueued: '你选了新文件，会为这张订单开一个新版本。',
            reuseNewVersion: (name) => `已有零件「${name}」，会为这张订单开一个新的图纸版本。`,
            infoTitle: '零件信息',
            fldCode: '图号',
            codeHint: '零件的唯一标识；重复使用会复用已有零件',
            fldMaterial: '材料', fldSurface: '表面处理',
            drawingTitle: '图纸',
            drawingMissing: '未上传 · 订单提交前需上传',
            drawingUploadedCount: (n) => `已上传 ${n} 个文件`,
            drawingQueuedCount: (n) => `待上传 ${n} 个文件`,
            lockedPill: '已锁定',
            chooseDrawing: '＋ 选择图纸', replaceDrawing: '换图纸（开新版本）',
            download: '下载', removeTitle: '移除', confirmRemoveFile: (name) => `移除图纸「${name}」？`,
            preview: '预览', previewUnsupported: '该格式无法在线预览，请下载后用 CAD 软件打开',
            cancel: '取消', backToOrder: '返回订单',
            discardConfirm: '放弃未保存的修改？',
            addToOrder: '添加到订单',
            addHint: '添加后进入零件详情', saveEdit: '保存修改',
        },
            quotes: {
                title: '我的报价',
                detailTitle: '报价', partsHeader: (n) => `零件 ${n} 个`,
                colCode: '图号', colQty: '数量', colUnit: '单价', colSubtotal: '小计', total: '总计',
                reject: '拒绝报价', confirmPrice: (amount) => `确认价格（${amount}）`, fldRateDate: '汇率日期',
                empty: '暂无报价',
                emptySub: '订单提交后，平台报价会出现在这里',
                pendingSection: (n) => `待报价 ${n}`, quoteSection: (n) => `报价 ${n}`, awaiting: '等待运营报价',
                noQuote: '暂无报价',
                noQuoteSub: '这张订单目前没有待确认或已确认的报价',
                viewOrder: '查看订单',
                locked: (d) => `已锁定（汇率日期 ${d}）`,
                floating: (d) => `按 ${d} 汇率，确认前会变`,
                noRate: '暂时取不到汇率，价格稍后显示',
                rejectConfirm: '拒绝这份报价？订单会退回，等平台重新报价。',
                confirmTitle: '确认这份报价？',
                confirmBody: (total, commitDate) => `总价 ${total}，承诺交期 ${commitDate}。确认后汇率锁定，价格不再变动；确认后你无法自行撤回。`,
                confirmCta: '确认报价',
                rateNote: (d) => `价格按 ${d} 的汇率计算，确认前会随汇率变动；点「确认价格」时按当时显示的价格锁定。`,
                rejected: '你已拒绝这份报价，订单已退回，等平台重新报价。新报价出来后会显示在这里。',
                confirmedAt: (when, d) => `已于 ${when} 确认，价格已锁定（汇率日期 ${d}）。`,
                infoTitle: '报价信息',
                fldCurrency: '币种',
                fldLeadTime: '交期',
                fldQuotedAt: '报价时间',
            },
        },
        flow: ['上传', '报价', '抢单', '交付'],
        login: {
            h: '登录', sub: '还没有账号？', subA: '注册',
            email: '企业邮箱', pw: '密码', forgot: '忘记密码？', submit: '登录', or: '或',
            wx: '微信登录',
            modePassword: '密码登录', modeCode: '验证码登录',
            sendCode: '发送验证码', codeSentTo: '验证码已发送至', codeLabel: '6 位验证码',
            backToEmail: '← 换个邮箱', resend: '重新发送',
            resendIn: (sec) => `${sec}s 后可重发`,
            codeHint: '验证码 5 分钟内有效，只能用一次。',
            needsRegistration: '这个邮箱还没有账号。',
        },
        forgotPw: {
            h: '重置密码', back: '← 返回登录',
            email: '企业邮箱', sendCode: '发送验证码',
            codeSentHint: '如果这个邮箱已注册，验证码已发到邮箱，5 分钟内有效。',
            code: '6 位验证码', newPw: '新密码', confirmPw: '确认新密码',
            mismatch: '两次输入的密码不一致', passwordRule: '至少 8 位，最长 72 个英文字符或 24 个汉字',
            submit: '重置并登录', resend: '重新发送',
            resendIn: (sec) => `${sec}s 后可重发`,
        },
        reg: {
            h: '注册', sub: '已有账号？', subA: '返回登录',
            email: '企业邮箱', code: '验证码',
            sendCode: '发送验证码', resend: '重新发送',
            resendIn: (sec) => `${sec} 秒后重发`,
            codeSentTo: (email) => `验证码已发送至 ${email}`,
            hint: '验证码 5 分钟内有效、只能用一次。账号不设密码，以后用邮箱验证码登录。',
            submit: '创建账号',
            errRequired: '请先填写邮箱',
            errCode: '请输入 6 位验证码',
            errCompany: '请先填写公司名称',
            company: '公司名称',
            companyHint: '会显示在报价单与合同上',
            errTaken: '这个邮箱已经注册过了，直接登录即可',
            errFailed: '注册失败，请重试',
            otherCountry: '其他',
        },
        opsLogin: {
            brand: '融一智造 · 内部后台',
            h: '运营登录',
            email: '企业邮箱', pw: '密码', submit: '登录',
            badCredentials: '账号或密码错误', failed: '登录失败，请重试',
        },
        status: {
            order: {
                DRAFT: '草稿中', SUBMITTED: '已提交', QUOTED: '待确认报价',
                CONFIRMED: '已确认报价', READY: '已完工 · 待发货', SHIPPED: '已发货', COMPLETED: '已完成', CANCELLED: '已取消',
            },
            line: { PENDING: '待安排', IN_PROGRESS: '进行中', FULFILLED: '已完成', CANCELLED: '已取消' },
            quote: { SENT: '待确认', SUPERSEDED: '已被重报取代', REJECTED: '已拒绝', CONFIRMED: '已确认' },
        },
    supplier: {
        hall: {
            title: '订单市场', availableTitle: '可以接的单',
            available: (n) => `${n} 张`,
            colSource: '来源', colLines: '零件行', colQty: '件数', colTotal: '对供合计',
            colDue: '交期', colDispatched: '派出时间',
            targeted: '定向派给你', openMarket: '全市场',
            empty: '暂时没有可以接的单', emptySub: '平台派单后会出现在这里',
        },
        hallDetail: {
            back: '← 订单市场', title: '单子详情',
            gone: '这张单已经不在了', goneSub: '可能已被别人接走，或平台已经收回',
            acceptConfirm: (price, date) => `按 ¥ ${price}、交期 ${date} 接下这张单？`,
            declineConfirm: '不接这张单？它会从你的列表里消失。',
            summaryTitle: '概况', fldDue: '交期', fldTotal: '对供合计', fldDispatched: '派出时间',
            note: '先到先得，谁先接给谁。价格是人民币，接单时锁定。',
            partsTitle: (n) => `零件 ${n} 行`,
            colMaterialSurface: '材料 / 表面处理', colUnitPrice: '单价 ¥', colSubtotal: '小计 ¥', colDrawing: '图纸',
            decline: '不接', accept: '接单',
        },
        orders: {
            title: '我的订单', empty: '还没有接过单', emptySub: '在「订单市场」接单后会出现在这里',
            cardTitle: (id) => `订单 ${id}`,
            fldDue: '交期', fldTotal: '合计', fldAccepted: '接单时间',
            fldSigned: '签字时间', fldSignDeadline: '签字期限',
            signDeadlineNote: (when) => `${when}`,
            fldCancel: '取消',
            reworkLine: '返工 / 重做件',
            start: '开工', produced: '完工',
            startConfirm: '这一行开工？开工后不能撤回。',
            producedConfirm: '这一行已经完工？报完工后不能撤回。',
            awaitingContract: '等平台把合同建出来。到期还没签字，这张单会自动取消、退回平台重派。',
            withdraw: '退单',
            signNote: '签字即确认这张单的零件、价格和交期，签完不能退、不能改。',
            signConfirm: '签字确认',
            waitingSignConfirm: (total, due) => `签字确认这张单？合计 ¥ ${total}、交期 ${due}。签完不能退单、不能改。`,
            withdrawConfirm: '退掉这张单？退单后平台会重新派给别人。',
            shipConfirm: '把这一批发给平台？平台收到后开始质检。',
            unfinished: (n) => `还有 ${n} 行没完工 —— 整单全部完工才能发给平台。`,
            readyToShip: (n) => `${n} 行已完工，可以发给平台。`,
            shipped: '已发到平台，等质检结果。',
            ship: '发给平台',
            allFulfilled: '这张单的零件已全部质检合格。结算功能还没上线。',
        },
        bill: {
            title: '对账与开票',
            kpiCompleted: '已完工金额', kpiCompletedSub: (n) => `元 · ${n} 单`,
            kpiPending: '待客户回款', kpiPendingSub: '元 · 背靠背顺延',
            kpiToInvoice: '待开票', kpiToInvoiceSub: '单',
            cardSub: (lines, amount) => `${lines} 行 · ¥ ${amount}`,
            uploaded: '已上传待核验', toInvoice: '待开票',
            colAmount: '金额', colPaid: '客户回款', colDue: '应付日', colShipped: '发货',
            pendingPayment: '待回款',
            dueAfter: (days) => `客户回款后 T+${days} 天`, dueAfterPayment: '客户回款后支付',
            invoiceNote: (amount) => `整单开一张票，金额 ¥ ${amount}`,
            invoiceNoPlaceholder: '发票号', upload: '上传',
            empty: '还没有完工待结算的订单',
        },
        profile: {
            title: '企业资料', noData: '还没接真实数据',
            note: '（记录用，暂未参与派单过滤）', inspecting: '资质考察中',
            equipmentTitle: '设备清单',
            colEquipType: '设备类型', colMaxSize: '最大加工尺寸', colPrecision: '加工精度',
            infoTitle: '企业信息', orgName: '企业名称', uscc: '统一社会信用代码',
            contactPhone: '联系人 / 手机', invoiceTitle: '开票抬头', bankAccount: '收款账户',
        },
    },
    dispatch: {
        opsOrder: {
            ASSEMBLING: '组装中', OFFERED: '已定向派出', PUBLISHED: '已挂全市场',
            ASSIGNED: '供应商已接', FULFILLED: '零件已全部合格',
        },
        mode: { TARGETED: '定向派单', MARKET: '挂全市场' },
        offer: { OFFERED: '待回应', DECLINED: '已拒接', REVOKED: '已收回' },
        supplierOrder: {
            ACCEPTED: '已接单 · 等合同', CONTRACT_PENDING: '待供应商签字',
            CONTRACTED: '已签字 · 待开工', IN_PRODUCTION: '生产中',
            SHIPPED: '已发出 · 待平台质检', FULFILLED: '已全部合格', CANCELLED: '已取消',
        },
        line: {
            PENDING: '待开工', IN_PRODUCTION: '生产中', PRODUCED: '已完工 · 待发出',
            QC_PENDING: '待质检', QC_PASSED: '质检合格', SUPERSEDED: '已被拆分替代',
            SCRAPPED: '已报废', CANCELLED: '已取消',
        },
        cancelReason: { WITHDRAWN: '供应商退单', REVOKED: '运营收回', SIGN_TIMEOUT: '超时未签字' },
    },
    datePicker: { placeholder: '选择日期', clear: '清除', today: '今天' },
    account: { title: '账号设置', preferences: '偏好', language: '界面语言' },
    profile: {
        title: '个人资料', basic: '基本信息', nickname: '昵称', company: '公司名称', country: '国家/地区',
        companyMissing: '公司信息未完善，提交订单前需要填写', companyFill: '去填写',
        email: '邮箱', role: '身份',
        joined: '注册时间', edit: '编辑', save: '保存', cancel: '取消', saved: '已保存',
        password: '登录密码', changePassword: '修改密码', passwordHint: '修改后所有设备都要重新登录。',
        sendCode: '发送验证码', resend: '重新发送',
        resendIn: (sec) => `${sec}s 后可重发`,
        codeSentTo: (email) => `验证码已发送至 ${email}，5 分钟内有效。`,
        code: '6 位验证码', newPw: '新密码', confirmPw: '确认新密码',
        mismatch: '两次输入的密码不一致', passwordRule: '至少 8 位，最长 72 个英文字符或 24 个汉字',
    },
    misc: {
        notFoundTitle: '这个地址没有对应的页面',
        notFoundSub: '链接可能已经失效，或者你没有访问这个页面的身份。',
        backHome: '回首页',
        settings: '设置', appearance: '外观', light: '浅色', dark: '深色',
    },
        nav: {
            settings: '设置', signOut: '退出登录', menu: '菜单',
            defaultUser: '用户', supplierFallback: '供应商',
            customer: { orders: '我的订单', quotes: '我的报价' },
            supplier: {
                accept: '接单', orders: '我的订单', settlement: '结算', bill: '对账与开票',
                company: '企业', profile: '企业资料', hall: '订单市场', workspace: '我的工作台',
            },
            ops: {
                business: '业务', quotes: '报价', suppliers: '供应商',
                dispatch: '派单管理', production: '生产与质检', quoteSettings: '报价设置', costRates: '费率表',
                masterData: '主数据', accounts: '账号管理', internalOps: '内部 · 运营',
            },
        },
        ops: {
            orders: {
                title: '订单', colCustomer: '客户', colCreated: '下单', colProd: '生产订单',
                colProgress: '进度', colPaid: '客户回款', unscheduled: '未安排',
                paid: '已回款', unpaid: '未回款',
                markDelivered: '标记已交付', registerPayment: '登记回款', empty: '还没有订单',
            },
            quotes: {
                title: '报价', filterAll: '全部', tabSubmitted: '待报价', tabQuoted: '待客户确认', tabConfirmed: '已确认',
                orderCount: (n) => `${n} 单`,
                colQty: '总件数', colLead: '客户期望交期', colSubmitted: '提交时间', colQuote: '报价',
                leadDays: (n) => `${n} 天（仅参考）`, never: '未报过',
                empty: '暂无订单',
            },
            production: {
                title: '生产与质检',
                sub: '签完字的单在这里跟进度；货到之后按件数判合格 / 返工 / 报废',
                empty: '还没有已签字的单', emptySub: '供应商签完合同后会出现在这里',
                cardTitle: (id) => `供应商订单 ${id}`,
                fldSupplier: '供应商', fldOpsOrder: '生产订单', fldDue: '对供交期', fldSignedAt: '签字时间',
                colCustomer: '客户', colQc: '质检 / 补料', reworkLine: '返工 / 重做件',
                phPass: '合格', phRework: '返工', phScrap: '报废', submit: '提交',
                remade: '已补料', remake: '原厂重做',
                sumMismatch: (qty, sum) => `三个数之和要等于 ${qty} 件（现在是 ${sum}）`,
                confirmQc: (pass, rework, scrap) => `判定：合格 ${pass} / 返工 ${rework} / 报废 ${scrap}。返工件和报废件会从这一行拆出去。`,
            },
            parties: {
                title: '供应商', suppliers: '供应商', supplierCount: (n) => `${n} 家`,
                colCompany: '企业', colDiscount: '折率', colProcess: '工艺', colMaterial: '材料',
                colSize: '尺寸范围', colPrecision: '精度等级', colDispatchable: '可派单', colOnboarded: '入驻',
                disabled: '已停用', notSet: '未设置', canDispatch: '可派单', missingDiscount: '缺折率',
                edit: '编辑', empty: '还没有供应商',
                editTitle: (name) => `编辑：${name}`,
                fldDiscount: '折率（对供价 = 原价 × 折率，0.8 = 八折）', discountPlaceholder: '如 0.8',
                fldProcess: '工艺', fldMaterial: '材料', fldSize: '尺寸范围', fldPrecision: '精度等级',
                freeText: '自由填写',
                discountHint: '折率录好这家就能被派单；能力可以以后补，只给派单时参考。',
                saved: (name) => `「${name}」已保存`,
                errDiscount: '折率请填大于 0、最多 4 位小数的数字，如 0.8', errDiscountRequired: '已设置的折率不能清空，只能改成另一个数', save: '保存',
            },
            accounts: {
                title: '账号管理',
                tabUsers: '外部用户', tabOrgs: '组织', tabStaff: '运营账号',
                search: '搜索', query: '查询',
                colEmail: '邮箱', colName: '姓名', colOrg: '公司', colType: '类型',
                colStatus: '状态', colVerified: '邮箱已验证', colCreated: '创建', colCountry: '国家',
                colDept: '内部组织',
                statusActive: '正常', statusDisabled: '已禁用',
                typeCustomer: '客户', typeSupplier: '供应商', typeInternal: '内部',
                verified: '已验证', unverified: '未验证',
                create: '＋ 新建', edit: '编辑', disable: '禁用', enable: '启用',
                save: '保存', cancel: '取消',
                newUser: '新建外部用户', editUser: '编辑外部用户',
                newOrg: '新建组织', editOrg: '编辑组织',
                newStaff: '新建运营账号', editStaff: '编辑运营账号',
                fldOrg: '所属公司', fldEmail: '登录邮箱', fldName: '姓名',
                fldPassword: '初始密码（至少 8 位）', fldCountry: '国家/地区',
                fldType: '类型',
                fldMarkup: '报价系数', fldMarkupHint: '留空 = 用全局默认',
                markupUnset: '全局默认未设置',
                markupOwn: (rate) => `公司单独配置 × ${rate}`, markupDefault: (rate) => `全局默认 × ${rate}`,
                immutable: '（不可改）', immutableType: '（不可改：改类型等于改受众）',
                passwordRule: '至少 8 位',
                all: '全部', selectPlaceholder: '（请选择）',
                usersTotal: (n) => `${n} 个`, orgsTotal: (n) => `${n} 家`, staffTotal: (n) => `${n} 个`,
                noUsers: '还没有外部用户',
                noOrgs: '还没有组织', noStaff: '还没有运营账号',
                staffOrgHint: '运营账号不挂客户/供应商，必须属于「内部」组织。如果选不到，先去「组织」页建一个内部组织。',
                confirmDisableUser: (email) => `禁用 ${email}？禁用后无法登录，数据保留。`,
                confirmDisableOrg: (name) => `禁用「${name}」？该公司下的账号将无法登录；数据保留。`,
                confirmDisableStaff: (email) => `禁用运营账号 ${email}？禁用后无法登录后台。`,
                created: '已创建', saved: '已保存',
                disabledOk: (who) => `已禁用 ${who}`,
                enabledOk: (who) => `已启用 ${who}`,
            },


            dispatchPage: {
                title: '派单管理', newOpsOrder: '＋ 新建生产订单',
                created: (id) => `已新建生产订单 ${id}`,
                poolTitle: '待派的零件', poolCount: (n) => `${n} 行`,
                colCustomerOrder: '客户 / 订单', colMaterialSurface: '材料 / 表面处理', colSubmitted: '客户提交',
                allocate: '分配', poolEmpty: '没有待派的零件',
                poolEmptySub: '客户确认报价后，零件会出现在这里',
                pickTitle: (code, name, qty) => `分配：${code} · ${name} · ${qty} 件`,
                colOpsOrder: '生产订单（组装中）', colExistingLines: '已有零件行', colSplitQty: '这一行分几件',
                unitPieces: '件', noAssembling: '没有组装中的生产订单',
                noAssemblingSub: '先点右上角「新建生产订单」',
                splitNote: (qty, sum) => `一次拆完：各份加起来必须等于 ${qty} 件（现在 ${sum} 件）。只分给一张就在那一张填 ${qty}。`,
                cancel: '取消', confirmAllocate: '确认分配',
                ordersTitle: '生产订单', orderCount: (n) => `${n} 张`,
                colNo: '编号', colMode: '派法', colLines: '零件行', colPieces: '件数',
                colCustomers: '客户数', colSupplierDue: '对供交期', colAcceptedBy: '接单方', colBuilt: '建立',
                ordersEmpty: '还没有生产订单',
                errInteger: '请在生产订单里填整数件数',
                errSplitMismatch: (qty, sum) => `各份加起来要等于 ${qty} 件，现在是 ${sum} 件`,
                allocated: (code, orders) => `「${code}」已分配到 ${orders} 张生产订单`,
            },
        },
        quoteWork: {
            back: '← 报价', title: '报价工作台',
            notFound: '订单不存在', notFoundSub: '草稿订单对运营不可见',
            errCurrency: '请选择币种', errCommitDate: '请选择承诺交期',
            errPrice: (code) => `「${code}」的原价请填大于 0、最多两位小数的数字`,
            confirmResend: '重新发出报价？客户手上待确认的那一版会作废。',
            confirmSend: '发出报价？客户会看到按最新汇率计算的价格，确认前随汇率变动。',
            sent: '报价已发出',
            lockedBanner: '客户已确认报价，价格和汇率已锁定，这一页只读。',
            cancelledBanner: '订单已取消，不能报价。',
            quoteTitle: '零件', requoteTitle: '重新报价',
            needMarkup: '还没有报价系数，请先在「报价设置」里填全局默认值',
            basePriceHint: '原价按标准价填：对客价 = 原价 × 报价系数，对供价 = 原价 × 各家折率。AI 估的是成本，不要直接填进来。',
            resendBtn: '重新发出', sendBtn: '发出报价',
            colPart: '零件', colMaterial: '材料', colSurface: '表面处理', colBasePrice: '原价 ¥/件',
            context: (customer, wanted, qty) => `客户 ${customer} · 期望交期 ${wanted} · 共 ${qty} 件`,
            lblMarkup: '报价系数', lblCurrency: '币种', lblCommitDate: '承诺交期',
            markupUnset: '未设置',
            customerRev: (v) => ` · 客户标记 ${v}`,
            historyTitle: '报价记录',
            colVersion: '版本', colCurrency: '币种', colLead: '承诺交期', colMarkup: '报价系数',
            colTotal: '对客总计', colRate: '汇率', colSentAt: '发出时间',
            markupTimes: (v) => `× ${v}`,
            rateLocked: '已锁定', rateUnlocked: '未锁定', empty: '还没有报价',
        },
        quoteSettings: {
            title: '报价设置',
            sub: '对客价 = 原价 × 汇率 × 报价系数',
            defaultTitle: '全局默认报价系数',
            defaultHint: '没有单独配置的公司都用这个值',
            defaultSaved: '已保存', defaultUnset: '未设置',
            companiesTitle: '客户公司',
            companyCount: (n) => `共 ${n} 家`,
            colCompany: '公司', colRate: '报价系数',
            usingDefault: '用默认', ownValue: '单独配置', manageCompanies: '管理公司 →',
            empty: '还没有客户公司', emptySub: '客户注册后会出现在这里',
        },
        estimate: {
            title: 'AI 成本估算', sub: '仅供参考 · 不含毛利 · 原价由运营填写',
            colCost: '估算成本 ¥/件', colResult: '结果', colAt: '估算时间',
            run: '估价', rerun: '重新估价', running: '估价中…', details: '明细',
            runningFor: (sec) => `估价中… ${sec} 秒`,
            stComplete: '完整', stIncomplete: '有缺项', stNotMachined: '非机加件，需人工',
            modalTitle: (code) => `AI 成本估算 · ${code}`,
            kind: { MATERIAL: '材料', PROCESS: '工序', OUTSOURCE: '外协', FIXED: '固定费' },
            unit: { KG: 'kg', HOUR: '小时', PIECE: '次', BATCH: '批' },
            colKind: '类别', colItem: '项目', colQty: '数量', colUnitPrice: '单价 ¥', colFactor: '数量系数', colAmount: '金额 ¥/件',
            missingRate: '缺费率', missingQty: '缺数量', fixedMissing: 'AI 未给出', aiEstimated: 'AI 估',
            total: '每件成本合计',
            incompleteHint: '有缺项，合计偏低。可在费率表补上对应费率后重新估价。',
            partType: 'AI 判断', material: '材料',
            weight: (net, blank) => `净重 ${net} kg · 毛坯 ${blank} kg`,
            assumptions: '用了这些默认值', toConfirm: '需找客户确认', files: '读取的图纸', skipped: '未读取', model: '模型',
        },
        costRates: {
            title: '费率表', sub: 'AI 成本估算按这里的单价算钱，改动只影响之后的估算',
            create: '新建', edit: '编辑', del: '删除', cancel: '取消', save: '保存',
            colKind: '类别', colName: '名称', colUnit: '计价单位', colPrice: '单价 ¥', colNote: '备注', colUpdated: '更新时间',
            kind: { MATERIAL: '材料', PROCESS: '工序', OUTSOURCE: '外协' },
            unit: { KG: '每 kg', HOUR: '每小时', PIECE: '每件', BATCH: '每批' },
            all: '全部',
            newTitle: '新建费率', editTitle: '编辑费率',
            errName: '请填名称', errPrice: '单价请填大于 0、最多两位小数的数字',
            confirmDelete: (name) => `删除「${name}」？之后的估算里这一项会显示缺费率。`,
            saved: '已保存', created: '已新建', deleted: (name) => `已删除「${name}」`,
            empty: '还没有费率',
        },
    shipTo: {
        title: '收货地址', fill: '填写', edit: '编辑', empty: '还没填收货地址', need: '请先填写收货地址',
        country: '国家/地区', company: '收货公司', contact: '收货人', phone: '电话',
        phoneHint: '快递派送和清关时联系收货人用',
        line1: '地址', line2: '楼层、单元等（选填）', city: '城市', region: '州/省', postalCode: '邮编',
        cancel: '取消', save: '保存', requiredMissing: '请把带 * 的项填完整',
        lockedNote: '订单已就绪，收货地址不能再改。',
    },
    addressBook: {
        title: '收货地址', add: '新增地址', edit: '编辑', del: '删除', setDefault: '设为默认', defaultTag: '默认',
        copy: '复制', copied: '已复制', copyFailed: '复制失败，请手动选中文字复制',
        empty: '还没有收货地址。下单前先在这里加一个，之后每张订单自动带出默认地址。',
        newTitle: '新增地址', editTitle: '编辑地址', makeDefault: '设为默认地址',
        deleteTitle: '删除地址', deleteBody: '删除后不能恢复。已经下过的订单里存的是当时的地址，不受影响。',
        deleted: '已删除', madeDefault: '已设为默认',
        paste: '智能粘贴', pasteHint: '把整段地址粘贴到这里，自动拆到下面各栏。拆完请检查一遍再保存。',
        pasteRun: '识别', pasteDone: '已填入下面各栏，请检查', pasteNothing: '没识别出内容，请手动填写',
        pickTitle: '选择收货地址', use: '使用这个地址', manage: '管理地址簿', pickEmpty: '还没有收货地址。',
        opsButton: '收货地址', opsTitle: (name) => `${name} 的收货地址`, opsEmpty: '这个用户还没有收货地址',
    },
    prodDetail: {
        back: '← 派单管理', title: '生产订单', notFound: '生产订单不存在',
        dueProblem: '请填对供交期（如 2026-10-20）', errNoSupplier: '请勾选要派的供应商',
        confirmOffer: (n) => `定向派给 ${n} 家？先到先得，谁先接给谁。`, offered: '已定向派出',
        confirmPublish: '挂到全市场？所有可派单的供应商都看得到，先到先得。', published: '已挂全市场',
        confirmRecall: '收回？还没人接，收回后回到组装中。', recalled: '已收回',
        confirmCreateContract: '建合同、发给供应商签字？签字前可以作废。',
        contractCreated: '合同已建，等供应商签字',
        confirmCancelContract: '作废这份合同？回到「已接单、等合同」，可以重新建。',
        contractCancelled: '合同已作废',
        confirmRevokeSupplier: (name) => `收回「${name}」接的单？对方的单会取消，这张回到组装中重派。`,
        revokedSupplier: '已收回供应商',
        confirmUnallocate: (code) => `撤回「${code}」的分配？这一行拆出去的所有份会一起撤回待派。`,
        unallocated: (code) => `「${code}」已撤回`,
        summaryTitle: '概况', fldLines: '零件行', fldTotalQty: '总件数', fldMode: '派法',
        fldDue: '对供交期', fldDispatched: '派出时间', fldSupplier: '接单方',
        partsTitle: '零件', colCustomerOrder: '客户 / 订单', colMaterialSurface: '材料 / 表面处理',
        colPieces: '件数', unallocate: '撤回分配',
        emptyParts: '还没有零件', emptyPartsSub: '到「派单管理」把待派的零件分配进来',
        deleteEmpty: '删除这张空单',
        priceTitle: '各家对供价（按当前折率，接单时锁定）',
        colSupplier: '供应商', colDiscount: '折率', colSupplierTotal: '对供合计 ¥',
        noSupplierAvailable: '还没有可派单的供应商', noSupplierAvailableSub: '到「供应商」给供应商录折率',
        offerDueLabel: '对供交期',
        publishBtn: '挂全市场', offerSelected: (n) => `定向派给选中的 ${n} 家`,
        offersOpen: '派单中', offersAccepted: '已被接下',
        colOfferedTo: '这一轮派给',
        marketNote: '挂在全市场，所有可派单的供应商都看得到，谁先接给谁。',
        acceptedNote: (name, when, due) => `「${name}」于 ${when} 接单，对供交期 ${due}。`,
        awaitingContract: (deadline) => `还没建合同。签字期限 ${deadline}，到点还没签字，系统会自动取消这张单、退回待派。`,
        awaitingSignature: (created, deadline) => `合同已建（${created}），等供应商签字。签字期限 ${deadline}，到点没签自动取消退回待派。`,
        signedNote: (when) => `供应商已于 ${when} 签字，单据锁定：收不回、改不了。生产、质检、发货还没做。`,
        createContract: '建合同', dropContract: '作废合同', recall: '收回',
        revokeSupplier: '收回供应商', ship: '发货', cancelHistory: '取消记录',
        colReason: '原因', colAcceptedAt: '接单', colCancelledAt: '取消',
    },
    shipping: {
        title: '发货', carrier: '承运商', trackingNo: '运单号', shippedAt: '发货时间', receivedAt: '确认收货',
        shipBtn: '发货给客户', shipModalTitle: '发货给客户', shipSubmit: '确认发货',
        needBoth: '承运商和运单号都要填', shipped: '已发货',
        docsTitle: '随货文件', docsHint: '质检报告、材质证明等，PDF / JPG / PNG。客户确认收货前都能补传。',
        docsEmpty: '还没有随货文件', upload: '上传文件', uploading: '上传中…',
        uploaded: (name) => `已上传 ${name}`, download: '下载',
        customerShipped: '货已发出。收到货后请点「确认收货」。', confirmReceipt: '确认收货',
        confirmReceiptTitle: '确认已经收到货？', confirmReceiptBody: '确认后订单完成，不能撤回。',
        customerCompleted: (when) => `已于 ${when} 确认收货，订单已完成。`,
        supplierShipTitle: '发给平台', supplierShipSubmit: '发出', batches: '发货批次',
        batch: (carrier, trackingNo, when) => `${carrier} ${trackingNo} · ${when}`,
    },
        errors: {
            'auth.bad_credentials': '账号或密码错误',
            'auth.otp_rate_limited': '发送太频繁，请稍后再试',
            'auth.otp_expired': '验证码已失效，请重新获取',
            'auth.otp_code_incorrect': '验证码不正确',
            'auth.otp_code_invalid': '请输入 6 位数字验证码',
            'auth.password_invalid': '密码至少 8 位，最长 72 个英文字符或 24 个汉字',
            'auth.password_same_as_current': '新密码不能和当前密码相同',
            'auth.otp_identifier_invalid': '邮箱格式不正确',
            'auth.otp_send_failed': '验证码发送失败，请稍后再试',
            'auth.otp_channel_unavailable': '该登录方式暂未开放',
            'organization.name_required': '请先补全公司名称',
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
            'order.ship_to_required': '请先填写收货地址',
            'order.ship_to_locked': '订单已就绪或已取消，收货地址不能再改',
            'address.not_found': '地址不存在或已被删除',
            'address.limit_reached': '最多只能存 20 条收货地址',
            'address.country_invalid': '请选择国家/地区',
            'address.parse_failed': '没能识别这段地址，请手动填写',
            'common.rate_limited': '操作太频繁，请稍后再试',
            'order.not_ready': '订单还没全部完工，或者已经发过货了',
            'order.not_shipped': '订单还没发货，或者已经确认过收货',
            'order.documents_locked': '订单还没完工，或者客户已经确认收货，不能再传随货文件',
            'order.document_type_not_allowed': '只能传 PDF、JPG、PNG 文件',
            'order.document_not_found': '文件不存在',
            'order.document_not_pending': '这个文件已经处理过了',
            'order.document_object_missing': '文件没有传上去，请重新上传',
            'order.line_not_found': '零件行不存在',
            'order.no_lines': '订单里还没有零件',
            'order.line_missing_drawing': '有零件还没传图纸，传完才能提交',
            'order.not_quotable': '这张订单现在不能报价（已确认或已取消）',
            'order.not_quoted': '这张订单现在没有待确认的报价',
            'estimate.no_readable_drawing': '这一行没有 AI 能读的图纸（只支持 PDF / PNG / JPG）',
            'estimate.ai_failed': 'AI 暂时不可用，请稍后再试',
            'estimate.busy': '正在进行的估价太多，请稍后再试',
            'estimate.ai_bad_output': 'AI 没有给出可用的结果，请重试',
            'cost_rate.duplicate': '同一类别下已有同名费率',
            'cost_rate.not_found': '费率不存在，可能已被删除',
            'cost_rate.material_needs_kg': '材料只能按 kg 计价',
            'quote.not_found': '暂无报价',
            'quote.not_open': '这份报价已失效（已确认、已拒绝或已被新报价取代），请刷新',
            'quote.price_changed': '汇率刚刚更新，价格已变化，请核对新价格后再确认',
            'quote.fx_unavailable': '暂时取不到汇率，价格无法计算，请稍后再试',
            'quote.markup_missing': '这个客户还没设报价系数，先设报价系数再报价',
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
            'dispatch.contract_exists': '合同已经建过了',
            'dispatch.contract_missing': '还没有待签字的合同',
            'production.order_not_signed': '这张单还没签字，不能报工',
            'production.line_not_found': '这一行不存在',
            'production.line_not_pending': '这一行已经开过工了',
            'production.line_not_started': '这一行还没开工',
            'production.lines_unfinished': '还有零件没完工 —— 整单全部完工才能发给平台',
            'production.nothing_to_ship': '没有已完工、待发出的零件',
            'production.line_not_shipped': '这一行还没到平台，不能质检',
            'production.qc_quantity_mismatch': '合格 / 返工 / 报废三个数之和要等于这一行的件数',
            'production.line_not_scrapped': '这一行不是待补料的报废件',
            'dispatch.contract_signed': '合同已签字，锁定了，不能退也不能改',
            'dispatch.supplier_order_not_pending': '这张单现在不是待签字状态',
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
        common: {
            prototypeTitle: 'Prototype page — not connected to live data.',
            prototypeBody: 'Lists, numbers and settings here are not production data. Do not base decisions on them.',
            unitPieces: 'pcs',
            decrease: 'Decrease',
            increase: 'Increase',
            noDrawings: 'No drawings yet',
            openInCad: 'Download and open in your local CAD software',
            fileCount: (n) => `${n} file${n === 1 ? '' : 's'}`,
            actionFailed: 'Something went wrong. Please try again.',
            loading: 'Loading…', retry: 'Retry', cancel: 'Cancel', ok: 'OK', noMatch: 'No matching results', create: 'Create',
            save: 'Save', edit: 'Edit', saved: 'Saved', close: 'Close', openInNewTab: 'Open in new tab', required: 'required',
            prevPage: 'Previous', nextPage: 'Next',
            pageTotal: (n) => `${n} item${n === 1 ? '' : 's'}`, pageOf: (page, pages) => `Page ${page} of ${pages}`,
            untitledOrder: 'Untitled order',
            table: {
                name: 'Name', parts: 'Parts', quantity: 'Total qty', created: 'Created', status: 'Status',
                order: 'Order', totalPrice: 'Total', price: 'Price', leadTime: 'Lead time', quotedAt: 'Quoted at',
            },
        },
        customer: {
            orders: {
                title: 'My orders',
                sub: 'Add parts and drawings, then submit',
                count: (n) => `${n} order${n === 1 ? '' : 's'}`,
                newOrder: '+ New order', newTitle: 'New order',
                titlePlaceholder: 'Order name (optional)',
                deleteOrder: 'Delete',
                deleteConfirm: 'Delete this draft? Its drawings are deleted too. This cannot be undone.',
                confirmQuote: 'Confirm quote ›',
                empty: 'No orders yet', emptySub: 'Create an order to add parts',
            },
        orderDetail: {
            notFound: 'Order not found', backToOrders: '← My orders',
            addPart: '+ Add part', addFirstPart: '+ Add part',
            missingDrawingBanner: (n) => `${n} part${n === 1 ? '' : 's'} without drawings — all parts need drawings before submitting.`,
            submittedBanner: 'Order submitted. Drawing revisions are locked and can no longer be changed.',
            quotedBanner: 'We have sent a quote; it is waiting for your confirmation.', cancelledBanner: 'Order cancelled.',
            statusSubmitted: 'We are pricing your order. The quote will appear in "My quotes" for you to confirm.',
            statusQuoted: (amount, commitDate) => `Quote ready: ${amount} (locked at the rate on the day you confirm) · delivery ${commitDate}`,
            statusConfirmed: 'Quote confirmed.',
            statusReady: 'All parts are finished.',
            statusViewQuotes: 'My quotes →', statusConfirmQuote: 'Review and confirm', statusQuoteDetail: 'Quote details →',
            infoTitle: 'Order details',
            fldName: 'Name', fldLead: 'Requested delivery date', needWantedDate: 'Please fill in the requested delivery date',
            fldParts: 'Parts', fldTotalQty: 'Total quantity', fldCreated: 'Created', fldSubmitted: 'Submitted',
            partsTitle: (n) => `${n} part${n === 1 ? '' : 's'}`, missingDrawingPill: (n) => `${n} missing drawing`,
            colRevision: 'Rev', colMaterial: 'Material', colDrawing: 'Drawing', colProgress: 'Progress',
            colCode: 'Drawing no.', colQty: 'Qty',
            customerRev: (v) => `Customer mark ${v}`,
            drawingUploaded: 'Drawing attached', drawingMissing: 'No drawing', remove: 'Remove',
            confirmRemoveLine: (code) => `Remove part "${code}"? Its drawings are removed with it.`,
            emptyParts: 'No parts yet', emptyPartsSub: 'Add parts and drawings, then submit',
            submit: 'Submit order',
            submitConfirmTitle: 'Submit this order?',
            submitConfirmBody: 'Drawing revisions of every part will be locked and can no longer be changed.',
            submitConfirmCta: 'Submit',
            needDrawings: (n) => `${n} part${n === 1 ? '' : 's'} still need drawings`,
            needParts: 'Add a part first',
            needCompany: 'Your company name is required before submitting; it appears on quotes and contracts.',
            fillCompany: 'Add company name',
        },
        partForm: {
            uploadFailed: 'Upload failed',
            errRequired: 'Drawing no., name and quantity are required; quantity must be at least 1',
            notFound: 'Part not found',
            titleNew: 'Add part', titleEdit: 'Edit part', titlePart: 'Part',
            lockedBanner: 'The order has been submitted or cancelled; parts can no longer be added.',
            reuseExisting: (name, files) => `Part "${name}" already exists. Adding it to this order reuses the drawings submitted last time (${files} file${files === 1 ? '' : 's'}).`,
            reuseNewVersionQueued: 'You selected new files, so a new revision will be created for this order.',
            reuseNewVersion: (name) => `Part "${name}" already exists; a new drawing revision will be created for this order.`,
            infoTitle: 'Part details',
            fldCode: 'Drawing no.',
            codeHint: 'Identifies the part; reusing it links to the existing part',
            fldMaterial: 'Material', fldSurface: 'Surface finishing',
            drawingTitle: 'Drawings',
            drawingMissing: 'Not uploaded yet — required before submitting the order',
            drawingUploadedCount: (n) => `${n} file${n === 1 ? '' : 's'} uploaded`,
            drawingQueuedCount: (n) => `${n} file${n === 1 ? '' : 's'} queued`,
            lockedPill: 'Locked',
            chooseDrawing: '+ Choose drawings', replaceDrawing: 'Change drawings (new revision)',
            download: 'Download', removeTitle: 'Remove', confirmRemoveFile: (name) => `Remove the drawing "${name}"?`,
            preview: 'Preview', previewUnsupported: 'This format cannot be previewed; download it and open it in CAD',
            cancel: 'Cancel', backToOrder: 'Back to order',
            discardConfirm: 'Discard unsaved changes?',
            addToOrder: 'Add to order',
            addHint: 'Opens the part after adding', saveEdit: 'Save changes',
        },
            quotes: {
                title: 'My quotes',
                detailTitle: 'Quote', partsHeader: (n) => `${n} part${n === 1 ? '' : 's'}`,
                colCode: 'Drawing no.', colQty: 'Qty', colUnit: 'Unit price', colSubtotal: 'Subtotal', total: 'Total',
                reject: 'Reject quote', confirmPrice: (amount) => `Confirm price (${amount})`, fldRateDate: 'FX date',
                empty: 'No quotes yet',
                emptySub: 'Quotes appear here once you submit an order',
                pendingSection: (n) => `Awaiting quote ${n}`, quoteSection: (n) => `Quotes ${n}`, awaiting: 'Awaiting quotation',
                noQuote: 'No quote yet',
                noQuoteSub: 'This order has no pending or confirmed quote',
                viewOrder: 'View order',
                locked: (d) => `Locked (FX date ${d})`,
                floating: (d) => `At the ${d} FX rate — subject to change until confirmed`,
                noRate: 'FX rate unavailable; the price will appear shortly',
                rejectConfirm: 'Reject this quote? The order goes back and we will re-quote.',
                confirmTitle: 'Confirm this quote?',
                confirmBody: (total, commitDate) => `Total ${total}, committed delivery ${commitDate}. Confirming locks the FX rate and the price will no longer change. You cannot undo this yourself.`,
                confirmCta: 'Confirm quote',
                rateNote: (d) => `The price uses the FX rate of ${d} and may change until you confirm. Clicking "Confirm price" locks the price shown at that moment.`,
                rejected: 'You rejected this quote. The order has gone back and we will re-quote; the new quote will appear here.',
                confirmedAt: (when, d) => `Confirmed on ${when}; price locked (FX date ${d}).`,
                infoTitle: 'Quote details',
                fldCurrency: 'Currency',
                fldLeadTime: 'Lead time',
                fldQuotedAt: 'Quoted at',
            },
        },
        flow: ['Upload', 'Quote', 'Claim', 'Deliver'],
        login: {
            h: 'Sign in', sub: "Don't have an account? ", subA: 'Sign up',
            email: 'Work email', pw: 'Password', forgot: 'Forgot password?',
            submit: 'Sign in', or: 'or',
            wx: 'Continue with WeChat',
            modePassword: 'Password', modeCode: 'Verification code',
            sendCode: 'Send code', codeSentTo: 'Code sent to', codeLabel: '6-digit code',
            backToEmail: '← Use another email', resend: 'Resend',
            resendIn: (sec) => `Resend in ${sec}s`,
            codeHint: 'The code is valid for 5 minutes and can be used once.',
            needsRegistration: 'This email does not have an account yet.',
        },
        forgotPw: {
            h: 'Reset password', back: '← Back to sign in',
            email: 'Work email', sendCode: 'Send code',
            codeSentHint: 'If this email is registered, a code has been sent to it. It is valid for 5 minutes.',
            code: '6-digit code', newPw: 'New password', confirmPw: 'Confirm new password',
            mismatch: 'The passwords do not match', passwordRule: 'At least 8 characters; at most 72 bytes (72 Latin letters or 24 Chinese characters)',
            submit: 'Reset and sign in', resend: 'Resend',
            resendIn: (sec) => `Resend in ${sec}s`,
        },
        reg: {
            h: 'Sign up', sub: 'Already have an account? ', subA: 'Sign in',
            email: 'Work email', code: 'Verification code',
            sendCode: 'Send code', resend: 'Resend',
            resendIn: (sec) => `Resend in ${sec}s`,
            codeSentTo: (email) => `Code sent to ${email}`,
            hint: 'The code is valid for 5 minutes and can be used once. Accounts have no password — you sign in with an email code.',
            submit: 'Create account',
            errRequired: 'Please enter your email first',
            errCode: 'Enter the 6-digit code',
            errCompany: 'Please enter your company name',
            company: 'Company name',
            companyHint: 'Shown on quotes and contracts',
            errTaken: 'This email is already registered — just sign in',
            errFailed: 'Sign-up failed. Please try again.',
            otherCountry: 'Other',
        },
        opsLogin: {
            brand: '融一智造 · Internal',
            h: 'Staff sign in',
            email: 'Work email', pw: 'Password', submit: 'Sign in',
            badCredentials: 'Incorrect email or password', failed: 'Sign-in failed. Please try again.',
        },
        status: {
            order: {
                DRAFT: 'Draft', SUBMITTED: 'Submitted', QUOTED: 'Quote pending',
                CONFIRMED: 'Quote confirmed', READY: 'Completed · awaiting shipment', SHIPPED: 'Shipped', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
            },
            line: { PENDING: 'Not scheduled', IN_PROGRESS: 'In progress', FULFILLED: 'Completed', CANCELLED: 'Cancelled' },
            quote: { SENT: 'Pending confirmation', SUPERSEDED: 'Superseded by a newer quote', REJECTED: 'Rejected', CONFIRMED: 'Confirmed' },
        },
    supplier: {
        hall: {
            title: 'Order market', availableTitle: 'Available orders',
            available: (n) => `${n} order${n === 1 ? '' : 's'}`,
            colSource: 'Source', colLines: 'Lines', colQty: 'Pieces', colTotal: 'Supplier total',
            colDue: 'Due', colDispatched: 'Dispatched',
            targeted: 'Offered to you', openMarket: 'Open market',
            empty: 'No orders available right now', emptySub: 'Orders appear here once we dispatch them',
        },
        hallDetail: {
            back: '← Order market', title: 'Order details',
            gone: 'This order is no longer available', goneSub: 'It may have been taken by someone else, or withdrawn by us',
            acceptConfirm: (price, date) => `Accept this order at ¥ ${price}, due ${date}?`,
            declineConfirm: 'Decline this order? It will disappear from your list.',
            summaryTitle: 'Summary', fldDue: 'Due date', fldTotal: 'Supplier total', fldDispatched: 'Dispatched at',
            note: 'First come, first served. Prices are in CNY and are locked when you accept.',
            partsTitle: (n) => `${n} line${n === 1 ? '' : 's'}`,
            colMaterialSurface: 'Material / finishing', colUnitPrice: 'Unit ¥', colSubtotal: 'Subtotal ¥', colDrawing: 'Drawing',
            decline: 'Decline', accept: 'Accept',
        },
        orders: {
            title: 'My orders', empty: 'No orders accepted yet', emptySub: 'Orders you accept in the order market appear here',
            cardTitle: (id) => `Order ${id}`,
            fldDue: 'Due date', fldTotal: 'Total', fldAccepted: 'Accepted at',
            fldSigned: 'Signed at', fldSignDeadline: 'Sign by',
            signDeadlineNote: (when) => `${when}`,
            fldCancel: 'Cancelled',
            reworkLine: 'Rework / remake',
            start: 'Start', produced: 'Mark produced',
            startConfirm: 'Start production on this line? This cannot be undone.',
            producedConfirm: 'Mark this line as produced? This cannot be undone.',
            awaitingContract: 'Waiting for us to issue the contract. If it is not signed in time, the order is cancelled automatically and re-dispatched.',
            withdraw: 'Withdraw',
            signNote: 'Signing confirms the parts, price and due date of this order. It cannot be withdrawn or changed afterwards.',
            signConfirm: 'Sign and confirm',
            waitingSignConfirm: (total, due) => `Sign this order? Total ¥ ${total}, due ${due}. It cannot be withdrawn or changed after signing.`,
            withdrawConfirm: 'Withdraw this order? We will re-dispatch it to another supplier.',
            shipConfirm: 'Ship this batch to us? QC starts when it arrives.',
            unfinished: (n) => `${n} line${n === 1 ? '' : 's'} not finished — the whole order must be finished before shipping.`,
            readyToShip: (n) => `${n} line${n === 1 ? '' : 's'} finished and ready to ship.`,
            shipped: 'Shipped to us; awaiting QC results.',
            ship: 'Ship to us',
            allFulfilled: 'All parts in this order have passed QC. Settlement is not available yet.',
        },
        bill: {
            title: 'Reconciliation & invoicing',
            kpiCompleted: 'Completed value', kpiCompletedSub: (n) => `CNY · ${n} order${n === 1 ? '' : 's'}`,
            kpiPending: 'Awaiting customer payment', kpiPendingSub: 'CNY · back-to-back',
            kpiToInvoice: 'To invoice', kpiToInvoiceSub: 'orders',
            cardSub: (lines, amount) => `${lines} line${lines === 1 ? '' : 's'} · ¥ ${amount}`,
            uploaded: 'Uploaded, pending review', toInvoice: 'To invoice',
            colAmount: 'Amount', colPaid: 'Customer payment', colDue: 'Due date', colShipped: 'Shipped',
            pendingPayment: 'Awaiting payment',
            dueAfter: (days) => `T+${days} days after customer payment`, dueAfterPayment: 'Payable after customer payment',
            invoiceNote: (amount) => `One invoice for the whole order, ¥ ${amount}`,
            invoiceNoPlaceholder: 'Invoice no.', upload: 'Upload',
            empty: 'No completed orders to settle yet',
        },
        profile: {
            title: 'Company profile', noData: 'Not connected to live data yet',
            note: '(Recorded only — not used for dispatch filtering yet)', inspecting: 'Under qualification review',
            equipmentTitle: 'Equipment',
            colEquipType: 'Type', colMaxSize: 'Max size', colPrecision: 'Precision',
            infoTitle: 'Company information', orgName: 'Company name', uscc: 'Unified Social Credit Code',
            contactPhone: 'Contact / phone', invoiceTitle: 'Invoice title', bankAccount: 'Bank account',
        },
    },
    dispatch: {
        opsOrder: {
            ASSEMBLING: 'Assembling', OFFERED: 'Offered', PUBLISHED: 'Published to market',
            ASSIGNED: 'Accepted by supplier', FULFILLED: 'All parts passed QC',
        },
        mode: { TARGETED: 'Targeted dispatch', MARKET: 'Open market' },
        offer: { OFFERED: 'Awaiting response', DECLINED: 'Declined', REVOKED: 'Withdrawn' },
        supplierOrder: {
            ACCEPTED: 'Accepted · awaiting contract', CONTRACT_PENDING: 'Awaiting your signature',
            CONTRACTED: 'Signed · production not started', IN_PRODUCTION: 'In production',
            SHIPPED: 'Shipped · awaiting QC', FULFILLED: 'All parts passed QC', CANCELLED: 'Cancelled',
        },
        line: {
            PENDING: 'Not started', IN_PRODUCTION: 'In production', PRODUCED: 'Produced · ready to ship',
            QC_PENDING: 'Awaiting QC', QC_PASSED: 'QC passed', SUPERSEDED: 'Superseded by a split',
            SCRAPPED: 'Scrapped', CANCELLED: 'Cancelled',
        },
        cancelReason: { WITHDRAWN: 'Withdrawn by supplier', REVOKED: 'Withdrawn by us', SIGN_TIMEOUT: 'Signature timeout' },
    },
    datePicker: { placeholder: 'Pick a date', clear: 'Clear', today: 'Today' },
    account: { title: 'Account settings', preferences: 'Preferences', language: 'Language' },
    profile: {
        title: 'Profile', basic: 'Basic information', nickname: 'Nickname', company: 'Company name', country: 'Country / region',
        companyMissing: 'Company details are incomplete — fill them in before submitting an order',
        companyFill: 'Fill in',
        email: 'Email', role: 'Role',
        joined: 'Joined', edit: 'Edit', save: 'Save', cancel: 'Cancel', saved: 'Saved',
        password: 'Sign-in password', changePassword: 'Change password',
        passwordHint: 'After the change, every device has to sign in again.',
        sendCode: 'Send code', resend: 'Resend',
        resendIn: (sec) => `Resend in ${sec}s`,
        codeSentTo: (email) => `Code sent to ${email}. It is valid for 5 minutes.`,
        code: '6-digit code', newPw: 'New password', confirmPw: 'Confirm new password',
        mismatch: 'The passwords do not match', passwordRule: 'At least 8 characters; at most 72 bytes (72 Latin letters or 24 Chinese characters)',
    },
    misc: {
        notFoundTitle: 'This page does not exist',
        notFoundSub: 'The link may have expired, or you do not have access to this page.',
        backHome: 'Back to home',
        settings: 'Settings', appearance: 'Appearance', light: 'Light', dark: 'Dark',
    },
        nav: {
            settings: 'Settings', signOut: 'Sign out', menu: 'Menu',
            defaultUser: 'User', supplierFallback: 'Supplier',
            customer: { orders: 'Orders', quotes: 'Quotes' },
            supplier: {
                accept: 'Orders', orders: 'My orders', settlement: 'Settlement', bill: 'Reconciliation & invoicing',
                company: 'Company', profile: 'Company profile', hall: 'Order market', workspace: 'My workspace',
            },
            ops: {
                business: 'Business', quotes: 'Quotes', suppliers: 'Suppliers',
                dispatch: 'Dispatch', production: 'Production & QC', quoteSettings: 'Quote settings', costRates: 'Cost rates',
                masterData: 'Master data', accounts: 'Accounts', internalOps: 'Internal · Operations',
            },
        },
        ops: {
            orders: {
                title: 'Orders', colCustomer: 'Customer', colCreated: 'Created', colProd: 'Production order',
                colProgress: 'Progress', colPaid: 'Customer payment', unscheduled: 'Not scheduled',
                paid: 'Paid', unpaid: 'Unpaid',
                markDelivered: 'Mark delivered', registerPayment: 'Record payment', empty: 'No orders yet',
            },
            quotes: {
                title: 'Quotes', filterAll: 'All', tabSubmitted: 'To quote', tabQuoted: 'Awaiting customer', tabConfirmed: 'Confirmed',
                orderCount: (n) => `${n} order${n === 1 ? '' : 's'}`,
                colQty: 'Total qty', colLead: 'Requested lead time', colSubmitted: 'Submitted', colQuote: 'Quote',
                leadDays: (n) => `${n} days (reference)`, never: 'Never quoted',
                empty: 'No orders yet',
            },
            production: {
                title: 'Production & QC',
                sub: 'Track signed orders here; when goods arrive, mark each piece as passed / rework / scrap',
                empty: 'No signed orders yet', emptySub: 'Orders appear here after the supplier signs the contract',
                cardTitle: (id) => `Supplier order ${id}`,
                fldSupplier: 'Supplier', fldOpsOrder: 'Production order', fldDue: 'Supplier due date', fldSignedAt: 'Signed at',
                colCustomer: 'Customer', colQc: 'QC / remake', reworkLine: 'Rework / remake',
                phPass: 'Pass', phRework: 'Rework', phScrap: 'Scrap', submit: 'Submit',
                remade: 'Remade', remake: 'Remake in-house',
                sumMismatch: (qty, sum) => `The three numbers must add up to ${qty} (currently ${sum})`,
                confirmQc: (pass, rework, scrap) => `Result: passed ${pass} / rework ${rework} / scrap ${scrap}. Rework and scrap pieces are split off this line.`,
            },
            parties: {
                title: 'Suppliers', suppliers: 'Suppliers', supplierCount: (n) => `${n}`,
                colCompany: 'Company', colDiscount: 'Discount', colProcess: 'Processes', colMaterial: 'Materials',
                colSize: 'Size range', colPrecision: 'Precision', colDispatchable: 'Dispatchable', colOnboarded: 'Joined',
                disabled: 'Disabled', notSet: 'Not set', canDispatch: 'Dispatchable', missingDiscount: 'No discount rate',
                edit: 'Edit', empty: 'No suppliers yet',
                editTitle: (name) => `Edit: ${name}`,
                fldDiscount: 'Discount rate (supplier price = base price × rate; 0.8 = 20% off)', discountPlaceholder: 'e.g. 0.8',
                fldProcess: 'Processes', fldMaterial: 'Materials', fldSize: 'Size range', fldPrecision: 'Precision grade',
                freeText: 'Free text',
                discountHint: 'A supplier can be dispatched once a discount rate is set; capabilities are optional and only used as a reference.',
                saved: (name) => `${name} saved`,
                errDiscount: 'Enter a discount rate greater than 0 with at most 4 decimals, e.g. 0.8', errDiscountRequired: 'A discount rate that is set cannot be cleared, only changed to another number', save: 'Save',
            },
            accounts: {
                title: 'Accounts',
                tabUsers: 'External users', tabOrgs: 'Organizations', tabStaff: 'Staff accounts',
                search: 'Search', query: 'Search',
                colEmail: 'Email', colName: 'Name', colOrg: 'Company', colType: 'Type',
                colStatus: 'Status', colVerified: 'Email verified', colCreated: 'Created', colCountry: 'Country',
                colDept: 'Internal org',
                statusActive: 'Active', statusDisabled: 'Disabled',
                typeCustomer: 'Customer', typeSupplier: 'Supplier', typeInternal: 'Internal',
                verified: 'Verified', unverified: 'Not verified',
                create: '+ New', edit: 'Edit', disable: 'Disable', enable: 'Enable',
                save: 'Save', cancel: 'Cancel',
                newUser: 'New external user', editUser: 'Edit external user',
                newOrg: 'New organization', editOrg: 'Edit organization',
                newStaff: 'New staff account', editStaff: 'Edit staff account',
                fldOrg: 'Company', fldEmail: 'Login email', fldName: 'Name',
                fldPassword: 'Initial password (min 8 chars)', fldCountry: 'Country / region',
                fldType: 'Type',
                fldMarkup: 'Quote rate', fldMarkupHint: 'Leave blank to use the global default',
                markupUnset: 'Global default not set',
                markupOwn: (rate) => `Company override × ${rate}`, markupDefault: (rate) => `Global default × ${rate}`,
                immutable: ' (cannot be changed)', immutableType: ' (cannot be changed: type defines the audience)',
                passwordRule: 'Min 8 characters',
                all: 'All', selectPlaceholder: '(select)',
                usersTotal: (n) => `${n}`, orgsTotal: (n) => `${n}`, staffTotal: (n) => `${n}`,
                noUsers: 'No external users yet',
                noOrgs: 'No organizations yet', noStaff: 'No staff accounts yet',
                staffOrgHint: 'Staff accounts are not attached to customers or suppliers — they must belong to an Internal organization. If none is selectable, create one on the Organizations tab first.',
                confirmDisableUser: (email) => `Disable ${email}? They will not be able to sign in; data is kept.`,
                confirmDisableOrg: (name) => `Disable “${name}”? Accounts under it will not be able to sign in; data is kept.`,
                confirmDisableStaff: (email) => `Disable staff account ${email}? They will not be able to sign in.`,
                created: 'Created', saved: 'Saved',
                disabledOk: (who) => `${who} disabled`,
                enabledOk: (who) => `${who} enabled`,
            },

            dispatchPage: {
                title: 'Dispatch', newOpsOrder: '+ New production order',
                created: (id) => `Production order ${id} created`,
                poolTitle: 'Parts to dispatch', poolCount: (n) => `${n} line${n === 1 ? '' : 's'}`,
                colCustomerOrder: 'Customer / order', colMaterialSurface: 'Material / finishing', colSubmitted: 'Submitted',
                allocate: 'Allocate', poolEmpty: 'No parts to dispatch',
                poolEmptySub: 'Parts appear here once the customer confirms a quote',
                pickTitle: (code, name, qty) => `Allocate: ${code} · ${name} · ${qty} pcs`,
                colOpsOrder: 'Production order (assembling)', colExistingLines: 'Existing lines', colSplitQty: 'Pieces in this line',
                unitPieces: 'pcs', noAssembling: 'No production order in assembling',
                noAssemblingSub: 'Create one with “+ New production order” first',
                splitNote: (qty, sum) => `Allocate in one go: the shares must add up to ${qty} pcs (currently ${sum}). To allocate to a single order, put ${qty} there.`,
                cancel: 'Cancel', confirmAllocate: 'Confirm allocation',
                ordersTitle: 'Production orders', orderCount: (n) => `${n}`,
                colNo: 'No.', colMode: 'Mode', colLines: 'Lines', colPieces: 'Pieces',
                colCustomers: 'Customers', colSupplierDue: 'Supplier due', colAcceptedBy: 'Supplier', colBuilt: 'Created',
                ordersEmpty: 'No production orders yet',
                errInteger: 'Enter a whole number of pieces for each production order',
                errSplitMismatch: (qty, sum) => `The shares must add up to ${qty} pcs; currently ${sum}`,
                allocated: (code, orders) => `${code} allocated to ${orders} production order${orders === 1 ? '' : 's'}`,
            },
        },
        quoteWork: {
            back: '← Quotes', title: 'Quote workbench',
            notFound: 'Order not found', notFoundSub: 'Draft orders are not visible to operations',
            errCurrency: 'Please choose a currency', errCommitDate: 'Please choose a delivery date',
            errPrice: (code) => `Enter a base price above 0 with at most 2 decimals for ${code}`,
            confirmResend: 'Send the quote again? The version awaiting the customer will be superseded.',
            confirmSend: 'Send this quote? The customer sees prices at the latest FX rate; they may change until confirmed.',
            sent: 'Quote sent',
            lockedBanner: 'The customer confirmed this quote. Prices and FX are locked; this page is read-only.',
            cancelledBanner: 'The order was cancelled and cannot be quoted.',
            quoteTitle: 'Parts', requoteTitle: 'Re-quote',
            colPart: 'Part', colMaterial: 'Material', colSurface: 'Finishing', colBasePrice: 'Base ¥/pc',
            context: (customer, wanted, qty) => `Customer ${customer} · wanted ${wanted} · ${qty} pc${qty === 1 ? '' : 's'}`,
            lblMarkup: 'Quote rate', lblCurrency: 'Currency', lblCommitDate: 'Delivery date',
            markupUnset: 'Not set',
            customerRev: (v) => ` · customer mark ${v}`,
            needMarkup: 'No quote rate yet — set the global default in Quote settings',
            basePriceHint: 'Enter the standard price: customer price = base × quote rate, supplier price = base × each supplier\'s rate. The AI estimate is a cost — do not copy it here.',
            resendBtn: 'Send again', sendBtn: 'Send quote',
            historyTitle: 'Quote history',
            colVersion: 'Version', colCurrency: 'Currency', colLead: 'Delivery date', colMarkup: 'Quote rate',
            colTotal: 'Customer total', colRate: 'FX rate', colSentAt: 'Sent at',
            markupTimes: (v) => `× ${v}`,
            rateLocked: 'locked', rateUnlocked: 'not locked', empty: 'No quotes yet',
        },
        quoteSettings: {
            title: 'Quote settings',
            sub: 'Customer price = base price × FX rate × quote rate',
            defaultTitle: 'Global default quote rate',
            defaultHint: 'Used by companies without their own value',
            defaultSaved: 'Saved', defaultUnset: 'Not set',
            companiesTitle: 'Customer companies',
            companyCount: (n) => `${n} compan${n === 1 ? 'y' : 'ies'}`,
            colCompany: 'Company', colRate: 'Quote rate',
            usingDefault: 'Using default', ownValue: 'Company value', manageCompanies: 'Manage companies →',
            empty: 'No customer companies yet', emptySub: 'They appear here after customers sign up',
        },
        estimate: {
            title: 'AI cost estimate', sub: 'For reference only · no margin · base price is entered by ops',
            colCost: 'Est. cost ¥/pc', colResult: 'Result', colAt: 'Estimated',
            run: 'Estimate', rerun: 'Re-estimate', running: 'Estimating…', details: 'Details',
            runningFor: (sec) => `Estimating… ${sec}s`,
            stComplete: 'Complete', stIncomplete: 'Has gaps', stNotMachined: 'Not machined, manual',
            modalTitle: (code) => `AI cost estimate · ${code}`,
            kind: { MATERIAL: 'Material', PROCESS: 'Process', OUTSOURCE: 'Outsourced', FIXED: 'Fixed cost' },
            unit: { KG: 'kg', HOUR: 'h', PIECE: 'x', BATCH: 'batch' },
            colKind: 'Type', colItem: 'Item', colQty: 'Qty', colUnitPrice: 'Rate ¥', colFactor: 'Qty factor', colAmount: 'Amount ¥/pc',
            missingRate: 'No rate', missingQty: 'No quantity', fixedMissing: 'Not given by AI', aiEstimated: 'AI estimate',
            total: 'Cost per piece',
            incompleteHint: 'Some items are missing, so the total is too low. Add the rates in Cost rates and re-estimate.',
            partType: 'AI verdict', material: 'Material',
            weight: (net, blank) => `Net ${net} kg · blank ${blank} kg`,
            assumptions: 'Defaults assumed', toConfirm: 'Confirm with customer', files: 'Drawings read', skipped: 'Not read', model: 'Model',
        },
        costRates: {
            title: 'Cost rates', sub: 'AI cost estimates are priced from these rates; changes only affect later estimates',
            create: 'New', edit: 'Edit', del: 'Delete', cancel: 'Cancel', save: 'Save',
            colKind: 'Type', colName: 'Name', colUnit: 'Unit', colPrice: 'Rate ¥', colNote: 'Note', colUpdated: 'Updated',
            kind: { MATERIAL: 'Material', PROCESS: 'Process', OUTSOURCE: 'Outsourced' },
            unit: { KG: 'per kg', HOUR: 'per hour', PIECE: 'per piece', BATCH: 'per batch' },
            all: 'All',
            newTitle: 'New rate', editTitle: 'Edit rate',
            errName: 'Enter a name', errPrice: 'Enter a number above 0 with at most 2 decimals',
            confirmDelete: (name) => `Delete "${name}"? Later estimates will show this item as missing a rate.`,
            saved: 'Saved', created: 'Created', deleted: (name) => `Deleted "${name}"`,
            empty: 'No rates yet',
        },
    shipTo: {
        title: 'Shipping address', fill: 'Add', edit: 'Edit', empty: 'No shipping address yet', need: 'Please add a shipping address',
        country: 'Country/region', company: 'Company', contact: 'Recipient', phone: 'Phone',
        phoneHint: 'Used by the carrier to contact the recipient for delivery and customs',
        line1: 'Address', line2: 'Floor, unit, etc. (optional)', city: 'City', region: 'State/province', postalCode: 'Postal code',
        cancel: 'Cancel', save: 'Save', requiredMissing: 'Please fill in all fields marked *',
        lockedNote: 'The order is ready; the shipping address can no longer be changed.',
    },
    addressBook: {
        title: 'Shipping addresses', add: 'Add address', edit: 'Edit', del: 'Delete', setDefault: 'Set as default',
        defaultTag: 'Default',
        copy: 'Copy', copied: 'Copied', copyFailed: 'Could not copy. Please select the text and copy it manually.',
        empty: 'No shipping addresses yet. Add one here and every new order will use your default address.',
        newTitle: 'Add address', editTitle: 'Edit address', makeDefault: 'Use as my default address',
        deleteTitle: 'Delete address',
        deleteBody: 'This cannot be undone. Orders you already placed keep the address they were placed with.',
        deleted: 'Deleted', madeDefault: 'Default address updated',
        paste: 'Smart paste', pasteHint: 'Paste a whole address here and it will be split into the fields below. Check them before saving.',
        pasteRun: 'Fill in', pasteDone: 'Filled in below. Please check.', pasteNothing: 'Nothing recognised. Please fill in the fields manually.',
        pickTitle: 'Choose a shipping address', use: 'Use this address', manage: 'Manage addresses',
        pickEmpty: 'No shipping addresses yet.',
        opsButton: 'Addresses', opsTitle: (name) => `Shipping addresses of ${name}`, opsEmpty: 'This user has no shipping addresses',
    },
    prodDetail: {
        back: '← Dispatch', title: 'Production order', notFound: 'Production order not found',
        dueProblem: 'Enter the supplier due date (e.g. 2026-10-20)', errNoSupplier: 'Select at least one supplier',
        confirmOffer: (n) => `Offer to ${n} supplier${n === 1 ? '' : 's'}? First come, first served.`, offered: 'Offered',
        confirmPublish: 'Publish to the open market? Every dispatchable supplier can see it. First come, first served.', published: 'Published to market',
        confirmRecall: 'Withdraw? Nobody has accepted it yet; it goes back to assembling.', recalled: 'Withdrawn',
        confirmCreateContract: 'Create the contract and send it to the supplier to sign? It can be cancelled before signing.',
        contractCreated: 'Contract created; waiting for the supplier to sign',
        confirmCancelContract: 'Cancel this contract? It returns to “accepted, awaiting contract” and can be recreated.',
        contractCancelled: 'Contract cancelled',
        confirmRevokeSupplier: (name) => `Revoke the order accepted by ${name}? Their order is cancelled and this one goes back to assembling for re-dispatch.`,
        revokedSupplier: 'Supplier revoked',
        confirmUnallocate: (code) => `Unallocate ${code}? Every share split from this line returns to the dispatch pool.`,
        unallocated: (code) => `${code} unallocated`,
        summaryTitle: 'Summary', fldLines: 'Lines', fldTotalQty: 'Total quantity', fldMode: 'Mode',
        fldDue: 'Supplier due date', fldDispatched: 'Dispatched at', fldSupplier: 'Supplier',
        partsTitle: 'Parts', colCustomerOrder: 'Customer / order', colMaterialSurface: 'Material / finishing',
        colPieces: 'Pieces', unallocate: 'Unallocate',
        emptyParts: 'No parts yet', emptyPartsSub: 'Allocate parts to it from Dispatch',
        deleteEmpty: 'Delete this empty order',
        priceTitle: 'Supplier prices (at current discount rates, locked on acceptance)',
        colSupplier: 'Supplier', colDiscount: 'Discount', colSupplierTotal: 'Supplier total ¥',
        noSupplierAvailable: 'No dispatchable suppliers yet', noSupplierAvailableSub: 'Set discount rates under “Suppliers”',
        offerDueLabel: 'Supplier due date',
        publishBtn: 'Publish to market', offerSelected: (n) => `Offer to ${n} selected`,
        offersOpen: 'Dispatching', offersAccepted: 'Accepted',
        colOfferedTo: 'Offered to',
        marketNote: 'Published to the open market — every dispatchable supplier can see it, first come first served.',
        acceptedNote: (name, when, due) => `${name} accepted on ${when}, supplier due date ${due}.`,
        awaitingContract: (deadline) => `No contract yet. Signature deadline ${deadline}; if unsigned by then the order is cancelled and re-dispatched automatically.`,
        awaitingSignature: (created, deadline) => `Contract created (${created}), awaiting the supplier's signature. Deadline ${deadline}; if unsigned by then the order is cancelled and re-dispatched.`,
        signedNote: (when) => `Signed by the supplier on ${when}. The order is locked: it cannot be revoked or changed. Production, QC and shipping are not built yet.`,
        createContract: 'Create contract', dropContract: 'Cancel contract', recall: 'Withdraw',
        revokeSupplier: 'Revoke supplier', ship: 'Ship', cancelHistory: 'Cancellation history',
        colReason: 'Reason', colAcceptedAt: 'Accepted', colCancelledAt: 'Cancelled',
    },
    shipping: {
        title: 'Shipping', carrier: 'Carrier', trackingNo: 'Tracking number', shippedAt: 'Shipped', receivedAt: 'Received',
        shipBtn: 'Ship to customer', shipModalTitle: 'Ship to customer', shipSubmit: 'Confirm shipment',
        needBoth: 'Carrier and tracking number are both required', shipped: 'Shipped',
        docsTitle: 'Shipping documents', docsHint: 'QC reports, material certificates, etc. PDF / JPG / PNG. You can add more until the customer confirms receipt.',
        docsEmpty: 'No shipping documents yet', upload: 'Upload file', uploading: 'Uploading…',
        uploaded: (name) => `Uploaded ${name}`, download: 'Download',
        customerShipped: 'Your order has shipped. Click "Confirm receipt" once it arrives.', confirmReceipt: 'Confirm receipt',
        confirmReceiptTitle: 'Have you received the goods?', confirmReceiptBody: 'This completes the order and cannot be undone.',
        customerCompleted: (when) => `Receipt confirmed on ${when}. The order is complete.`,
        supplierShipTitle: 'Ship to us', supplierShipSubmit: 'Ship', batches: 'Shipments',
        batch: (carrier, trackingNo, when) => `${carrier} ${trackingNo} · ${when}`,
    },
        errors: {
            'auth.bad_credentials': 'Incorrect email or password',
            'auth.otp_rate_limited': 'Too many requests. Please try again later.',
            'auth.otp_expired': 'The code has expired. Please request a new one.',
            'auth.otp_code_incorrect': 'Incorrect code.',
            'auth.otp_code_invalid': 'Enter the 6-digit code.',
            'auth.password_invalid': 'The password must be at least 8 characters and at most 72 bytes (72 Latin letters or 24 Chinese characters).',
            'auth.password_same_as_current': 'The new password must be different from the current one.',
            'auth.otp_identifier_invalid': 'Please enter a valid email address.',
            'auth.otp_send_failed': 'Could not send the code. Please try again.',
            'auth.otp_channel_unavailable': 'This sign-in method is not available yet.',
            'organization.name_required': 'Please complete your company name first',
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
            'order.ship_to_required': 'Please add a shipping address',
            'order.ship_to_locked': 'The order is ready or cancelled; the shipping address can no longer be changed',
            'address.not_found': 'This address does not exist or has been deleted',
            'address.limit_reached': 'You can keep at most 20 shipping addresses',
            'address.country_invalid': 'Please select a country/region',
            'address.parse_failed': 'Could not read this address. Please fill in the fields manually.',
            'common.rate_limited': 'Too many attempts. Please try again later.',
            'order.not_ready': 'The order is not fully completed yet, or it has already shipped',
            'order.not_shipped': 'The order has not shipped yet, or receipt is already confirmed',
            'order.documents_locked': 'Documents can only be added after completion and before the customer confirms receipt',
            'order.document_type_not_allowed': 'Only PDF, JPG and PNG files are allowed',
            'order.document_not_found': 'File not found',
            'order.document_not_pending': 'This file has already been processed',
            'order.document_object_missing': 'The file did not upload. Please try again.',
            'order.line_not_found': 'Order line not found',
            'order.no_lines': 'The order has no parts yet',
            'order.line_missing_drawing': 'Some parts have no drawing yet. Upload them before submitting',
            'order.not_quotable': 'This order cannot be quoted now',
            'order.not_quoted': 'This order has no quote waiting for confirmation',
            'estimate.no_readable_drawing': 'This line has no drawing the AI can read (PDF / PNG / JPG only)',
            'estimate.ai_failed': 'The AI is unavailable right now, try again later',
            'estimate.busy': 'Too many estimates are running, try again shortly',
            'estimate.ai_bad_output': 'The AI did not return a usable result, try again',
            'cost_rate.duplicate': 'A rate with this name already exists in this type',
            'cost_rate.not_found': 'Rate not found, it may have been deleted',
            'cost_rate.material_needs_kg': 'Materials can only be priced per kg',
            'quote.not_found': 'No quote yet',
            'quote.not_open': 'This quote is no longer open. Please refresh',
            'quote.price_changed': 'The exchange rate was just updated and the price changed. Please review the new price before confirming',
            'quote.fx_unavailable': 'Exchange rates are temporarily unavailable, so the price cannot be calculated. Please try again later',
            'quote.markup_missing': 'Set a quote rate for this customer before quoting',
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
            'dispatch.contract_exists': 'A contract already exists',
            'dispatch.contract_missing': 'There is no contract waiting to be signed',
            'dispatch.contract_signed': 'The contract is signed and locked',
            'dispatch.supplier_order_not_pending': 'This order is not waiting for a signature',
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
