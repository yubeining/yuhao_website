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
        cancel: string; save: string
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
        home: {
            greeting: (name: string) => string
            newOrder: string
            quotesPending: (n: number) => string
            viewQuotes: string
            myOrders: string
            orderCount: (n: number) => string
            empty: string
            createFirst: string
        }
        orders: {
            title: string; sub: string; count: (n: number) => string
            newOrder: string; newTitle: string; titlePlaceholder: string
            cancelOrder: string; cancelConfirm: string
            empty: string; emptySub: string
        }
        orderDetail: {
            notFound: string; backToOrders: string; addPart: string; addFirstPart: string
            missingDrawingBanner: (n: number) => string; submittedBanner: string
            quotedBanner: string; quoteLink: string; confirmedBanner: string; cancelledBanner: string
            infoTitle: string; fldName: string; fldLead: string
            leadPlaceholder: string; titlePlaceholder: string; leadDays: (n: number) => string
            fldParts: string; fldTotalQty: string; fldCreated: string; fldSubmitted: string
            partsTitle: (n: number) => string; missingDrawingPill: (n: number) => string
            colRevision: string; colMaterial: string; colDrawing: string; colProgress: string
            colCode: string; colQty: string
            customerRev: (v: string) => string; drawingUploaded: string; drawingMissing: string
            remove: string; emptyParts: string; emptyPartsSub: string
            submitOrder: (n: number) => string; needDrawings: (n: number) => string; errLeadDays: string
        }
        partForm: {
            uploadFailed: string; errRequired: string; notFound: string
            titleNew: string; titleEdit: string; titlePart: string
            versionLine: (code: string, rev: number) => string
            lockedBanner: string
            reuseExisting: (name: string, rev: number, files: number) => string
            reuseNewVersionQueued: string; reuseNewVersion: (name: string) => string
            infoTitle: string
            fldCode: string; fldMaterial: string; fldSurface: string
            codePlaceholder: string; optionalPlaceholder: string
            drawingTitle: string; lockedPill: (rev: number) => string
            hintNew: string; hintLocked: string; hintRequired: string
            chooseDrawing: string; replaceDrawing: string
            noDrawing: string; download: string; removeTitle: string
            cancel: string; backToOrder: string; addToOrder: string; save: string
        }
        quotes: {
            title: string
            detailTitle: string; partsHeader: (n: number) => string
            colCode: string; colQty: string; colUnit: string; colSubtotal: string; total: string
            reject: string; confirmPrice: (amount: string) => string; fldRateDate: string
            empty: string
            emptySub: string
            noQuote: string
            noQuoteSub: string
            viewOrder: string
            locked: (rateDate: string) => string
            floating: (rateDate: string) => string
            noRate: string
            afterConfirm: (days: number) => string
            rejectConfirm: string
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
        note: string
        /** 两种登录方式 */
        modePassword: string; modeCode: string
        sendCode: string; codeSentTo: string; codeLabel: string
        backToEmail: string; resend: string; resendIn: (seconds: number) => string
        codeHint: string; needsRegistration: string
        staffPrompt: string; staffLink: string
    }
    reg: {
        h: string; sub: string; subA: string
        email: string; code: string; codeP: string
        sendCode: string; resend: string; resendIn: (seconds: number) => string
        codeSentTo: (email: string) => string
        hint: string
        agree: string; submit: string
        /** 本地校验提示（后端没这几种） */
        errRequired: string; errCode: string; errAgree: string
        errTaken: string; errFailed: string
        otherCountry: string
    }
    /** 内部（运营）登录。独立入口，和外部登录不共用文案。 */
    opsLogin: {
        brand: string; h: string; sub: string
        email: string; pw: string; submit: string
        badCredentials: string; failed: string
    }
    /** 订单 / 零件 / 报价的状态文案。★ 以后端枚举名为 key，不要自己起名。 */
    status: {
        order: Record<'DRAFT' | 'SUBMITTED' | 'QUOTED' | 'CONFIRMED' | 'READY' | 'CANCELLED', string>
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
    /** 个人资料页。只有昵称可改，其余只读。 */
    profile: {
        title: string; basic: string; nickname: string; email: string; role: string
        joined: string; edit: string; save: string; cancel: string; saved: string
    }
    /** 通用页面（404 / 设置） */
    misc: {
        notFoundTitle: string; notFoundSub: string; backHome: string
        settings: string; appearance: string; light: string; dark: string
        /** 注册时不收公司名，在设置里补（docs/design/14 §4）。 */
        companyInfo: string; companyName: string; companyNameHint: string; companySaved: string
    }
    /** 导航与外壳。三端共用，所以按端分组，不要混成一锅。 */
    nav: {
        settings: string; signOut: string; profile: string
        defaultUser: string; supplierFallback: string
        customer: { trade: string; overview: string; orders: string; quotes: string }
        supplier: {
            accept: string; orders: string; settlement: string; bill: string
            company: string; profile: string; hall: string; workspace: string
        }
        ops: {
            overview: string; dashboard: string; quoting: string; quotes: string
            dispatch: string; execution: string; production: string; orders: string
            masterData: string; parties: string; accounts: string; internalOps: string
        }
    }
    /** 运营后台 */
    ops: {
        dashboard: {
            title: string; failedTitle: string; failedBody: string
            kpiPending: string; kpiPendingSub: string
            kpiAssembling: string; kpiAssemblingSub: string
            kpiOffered: string; kpiOfferedSub: string
            missingTitle: string; missingText: string; missingSub: string
        }
        orders: {
            title: string; colCustomer: string; colCreated: string; colProd: string
            colProgress: string; colPaid: string; unscheduled: string
            paid: string; unpaid: string; markDelivered: string; registerPayment: string
            empty: string
        }
        quotes: {
            title: string; tabSubmitted: string; tabQuoted: string; tabConfirmed: string
            orderCount: (n: number) => string
            colQty: string; colLead: string; colSubmitted: string; colQuote: string
            leadDays: (n: number) => string; version: (n: number) => string; never: string; empty: string
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
            edit: string; empty: string; emptySub: string
            editTitle: (name: string) => string
            fldDiscount: string; discountPlaceholder: string
            fldProcess: string; fldMaterial: string; fldSize: string; fldPrecision: string
            freeText: string; discountHint: string; saved: (name: string) => string
            errDiscount: string; save: string
        }
        accounts: {
            title: string
            tabUsers: string; tabOrgs: string; tabStaff: string
            search: string; searchHint: string; query: string
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
            immutable: string; immutableType: string; passwordRule: string
            all: string; selectPlaceholder: string
            usersTotal: (n: number) => string
            orgsTotal: (n: number) => string
            staffTotal: (n: number) => string
            noUsers: string; noUsersSub: string; noOrgs: string; noStaff: string
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
            errCurrency: string; errLead: string; errPrice: (code: string) => string
            savedMarkup: string; confirmResend: string; confirmSend: string
            sentVersion: (n: number) => string
            lockedBanner: string; cancelledBanner: string
            orderInfoTitle: string; fldCustomer: string; fldParts: string; fldTotalQty: string
            fldLead: string; fldSubmitted: string; leadDays: (n: number) => string
            markupTitle: string; fldCurrent: string; fldUpdated: string; notSet: string
            markupPlaceholder: string; save: string
            markupNote: string; markupScope: string
            quoteTitle: string; requoteTitle: string; fillQuote: string; partsTitle: string
            colPart: string; colMaterialSurface: string; colBasePrice: string
            colUnit: string; colSubtotal: string
            customerRev: (v: string) => string; pricePlaceholder: string
            fldQuoteCurrency: string; fldLeadAfterConfirm: string; dayUnit: string; dayPlaceholder: string
            preview: (rateDate: string, eurCny: string, eurQuote: string, currency: string, markup: string, total: string) => string
            previewHint: string
            needMarkup: string; canProceed: string
            previewBtn: string; resendBtn: string; sendBtn: string
            historyTitle: string; versionCount: (n: number) => string
            colVersion: string; colCurrency: string; colLead: string; colMarkup: string
            colTotal: string; colRate: string; colSentAt: string
            markupTimes: (v: number) => string
            rateLocked: string; rateUnlocked: string; empty: string
        }
    /** 派单详情（生产订单） */
    prodDetail: {
        back: string; title: string; notFound: string
        dueProblem: string; errNoSupplier: string
        confirmOffer: (n: number) => string; offered: string
        confirmPublish: string; published: string
        confirmRecall: string; recalled: string
        contractCreated: string; confirmCancelContract: string; contractCancelled: string
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
            loading: '加载中…', retry: '重试', cancel: '取消', create: '创建', save: '保存',
            untitledOrder: '未命名订单',
            table: {
                name: '名称', parts: '零件', quantity: '总件数', created: '建单', status: '状态',
                order: '订单', totalPrice: '总价', price: '价格', leadTime: '交期', quotedAt: '报价时间',
            },
        },
        customer: {
            home: {
                greeting: (name) => `你好，${name}`,
                newOrder: '＋ 新建订单',
                quotesPending: (n) => `有 ${n} 单报价等你确认。`,
                viewQuotes: '我的报价 →',
                myOrders: '我的订单',
                orderCount: (n) => `${n} 单`,
                empty: '还没有订单',
                createFirst: '建第一个订单',
            },
            orders: {
                title: '我的订单',
                sub: '录入零件、传好图纸后提交',
                count: (n) => `共 ${n} 单`,
                newOrder: '＋ 新建订单', newTitle: '新建订单',
                titlePlaceholder: '订单名称（可选）',
                cancelOrder: '取消订单',
                cancelConfirm: '取消后不能恢复。确定取消这张订单吗？',
                empty: '暂无订单', emptySub: '新建订单后录入零件',
            },
        orderDetail: {
            notFound: '订单不存在', backToOrders: '← 我的订单',
            addPart: '＋ 添加零件', addFirstPart: '＋ 录入零件',
            missingDrawingBanner: (n) => `${n} 个零件还没传图纸，传齐后才能提交。`,
            submittedBanner: '订单已提交，各零件的图纸版本已锁定，不能再修改。',
            quotedBanner: '平台已报价，等你确认。', quoteLink: '查看报价 →',
            confirmedBanner: '报价已确认。', cancelledBanner: '订单已取消。',
            infoTitle: '订单信息',
            fldName: '名称', fldLead: '期望交期',
            leadPlaceholder: '天（仅供参考）', titlePlaceholder: '订单名称',
            leadDays: (n) => `${n} 天（仅供参考）`,
            fldParts: '零件数', fldTotalQty: '总件数', fldCreated: '建单日期', fldSubmitted: '提交时间',
            partsTitle: (n) => `零件 ${n} 个`, missingDrawingPill: (n) => `${n} 缺图纸`,
            colRevision: '版本', colMaterial: '材料', colDrawing: '图纸', colProgress: '进度',
            colCode: '图号', colQty: '数量',
            customerRev: (v) => `客户标记 ${v}`,
            drawingUploaded: '图纸已传', drawingMissing: '缺图纸', remove: '删除',
            emptyParts: '暂无零件', emptyPartsSub: '录入零件并传好图纸后提交',
            submitOrder: (n) => `提交订单（${n} 个零件）→`,
            needDrawings: (n) => `还有 ${n} 个零件缺图纸`,
            errLeadDays: '期望交期请填正整数天数',
        },
        partForm: {
            uploadFailed: '上传失败',
            errRequired: '图号、名称、数量为必填项，数量至少为 1',
            notFound: '零件不存在',
            titleNew: '添加零件', titleEdit: '编辑零件', titlePart: '零件',
            versionLine: (code, rev) => `${code} · 第 ${rev} 版`,
            lockedBanner: '订单已提交或已取消，不能再添加零件。',
            reuseExisting: (name, rev, files) => `已有零件「${name}」：加进订单后沿用上次提交的第 ${rev} 版图纸（${files} 个文件）。`,
            reuseNewVersionQueued: '你选了新文件，会为这张订单开一个新版本。',
            reuseNewVersion: (name) => `已有零件「${name}」，会为这张订单开一个新的图纸版本。`,
            infoTitle: '零件信息',
            fldCode: '图号 *', fldMaterial: '材料', fldSurface: '表面处理',
            codePlaceholder: '可从文件名自动识别', optionalPlaceholder: '可不填',
            drawingTitle: '图纸',
            lockedPill: (rev) => `第 ${rev} 版 · 已锁定`,
            hintNew: '选好的文件会在加进订单后上传',
            hintLocked: '这一版已随订单提交锁定；换图纸会开新版本，之前的订单不受影响',
            hintRequired: '每个零件至少要有一份图纸，订单才能提交',
            chooseDrawing: '＋ 选择图纸', replaceDrawing: '换图纸（开新版本）',
            noDrawing: '还没有图纸', download: '下载', removeTitle: '移除',
            cancel: '取消', backToOrder: '返回订单', addToOrder: '加进订单', save: '保存',
        },
            quotes: {
                title: '我的报价',
                detailTitle: '报价', partsHeader: (n) => `零件 ${n} 个`,
                colCode: '图号', colQty: '数量', colUnit: '单价', colSubtotal: '小计', total: '总计',
                reject: '拒绝报价', confirmPrice: (amount) => `确认价格（${amount}）`, fldRateDate: '汇率日期',
                empty: '暂无报价',
                emptySub: '订单提交后，平台报价会出现在这里',
                noQuote: '暂无报价',
                noQuoteSub: '这张订单目前没有待确认或已确认的报价',
                viewOrder: '查看订单',
                locked: (d) => `已锁定（汇率日期 ${d}）`,
                floating: (d) => `按 ${d} 汇率，确认前会变`,
                noRate: '暂时取不到汇率，价格稍后显示',
                afterConfirm: (days) => `确认后 ${days} 天`,
                rejectConfirm: '拒绝这份报价？订单会退回，等平台重新报价。',
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
            note: '继续即表示同意服务条款与隐私政策。',
            modePassword: '密码登录', modeCode: '验证码登录',
            sendCode: '发送验证码', codeSentTo: '验证码已发送至', codeLabel: '6 位验证码',
            backToEmail: '← 换个邮箱', resend: '重新发送',
            resendIn: (sec) => `${sec}s 后可重发`,
            codeHint: '验证码 5 分钟内有效，只能用一次。',
            needsRegistration: '这个邮箱还没有账号。',
            staffPrompt: '内部员工？', staffLink: '从这里登录',
        },
        reg: {
            h: '注册', sub: '已有账号？', subA: '返回登录',
            email: '企业邮箱', code: '验证码', codeP: '6 位验证码',
            sendCode: '发送验证码', resend: '重新发送',
            resendIn: (sec) => `${sec} 秒后重发`,
            codeSentTo: (email) => `验证码已发送至 ${email}`,
            hint: '验证码 5 分钟内有效、只能用一次。账号不设密码，以后用邮箱验证码登录。',
            agree: '我已阅读并同意服务条款与隐私政策',
            submit: '创建账号',
            errRequired: '请先填写邮箱',
            errCode: '请输入 6 位验证码',
            errAgree: '请先同意服务条款与隐私政策',
            errTaken: '这个邮箱已经注册过了，直接登录即可',
            errFailed: '注册失败，请重试',
            otherCountry: '其他',
        },
        opsLogin: {
            brand: '融一智造 · 内部后台',
            h: '运营登录',
            sub: '仅限内部员工。账号由管理员开通，不支持自助注册。',
            email: '企业邮箱', pw: '密码', submit: '登录',
            badCredentials: '账号或密码错误', failed: '登录失败，请重试',
        },
        status: {
            order: {
                DRAFT: '草稿中', SUBMITTED: '已提交', QUOTED: '待确认报价',
                CONFIRMED: '已确认报价', READY: '已完工 · 待发货', CANCELLED: '已取消',
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
            signDeadlineNote: (when) => `${when}（接单起 7 天）`,
            fldCancel: '取消',
            reworkLine: '返工 / 重做件',
            start: '开工', produced: '完工',
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
            SHIPPED: '已到平台 · 待质检', FULFILLED: '已全部合格', CANCELLED: '已取消',
        },
        line: {
            PENDING: '待开工', IN_PRODUCTION: '生产中', PRODUCED: '已完工 · 待发出',
            QC_PENDING: '待质检', QC_PASSED: '质检合格', SUPERSEDED: '已被拆分替代',
            SCRAPPED: '已报废', CANCELLED: '已取消',
        },
        cancelReason: { WITHDRAWN: '供应商退单', REVOKED: '运营收回', SIGN_TIMEOUT: '超时未签字' },
    },
    profile: {
        title: '个人资料', basic: '基本信息', nickname: '昵称', email: '邮箱', role: '身份',
        joined: '注册时间', edit: '编辑', save: '保存', cancel: '取消', saved: '已保存',
    },
    misc: {
        notFoundTitle: '这个地址没有对应的页面',
        notFoundSub: '链接可能已经失效，或者你没有访问这个页面的身份。',
        backHome: '回首页',
        settings: '设置', appearance: '外观', light: '浅色', dark: '深色',
        companyInfo: '公司信息', companyName: '公司名称',
        companyNameHint: '注册时没有收集。报价单、合同和发票都要用，提交订单前请补上。',
        companySaved: '公司名称已保存',
    },
        nav: {
            settings: '设置', signOut: '退出登录', profile: '个人资料',
            defaultUser: '用户', supplierFallback: '供应商',
            customer: { trade: '交易', overview: '概览', orders: '我的订单', quotes: '我的报价' },
            supplier: {
                accept: '接单', orders: '我的订单', settlement: '结算', bill: '对账与开票',
                company: '企业', profile: '企业资料', hall: '订单市场', workspace: '我的工作台',
            },
            ops: {
                overview: '总览', dashboard: '工作台', quoting: '询价与报价', quotes: '报价',
                dispatch: '派单管理', execution: '执行', production: '生产与质检', orders: '订单',
                masterData: '主数据', parties: '交易方', accounts: '账号管理', internalOps: '内部 · 运营',
            },
        },
        ops: {
            dashboard: {
                title: '工作台',
                failedTitle: '工作台数据没取到。', failedBody: '下面的数字是占位符，不要据此安排生产。',
                kpiPending: '待安排生产', kpiPendingSub: '已确认价格，等运营组包',
                kpiAssembling: '组包中', kpiAssemblingSub: '草稿，还没挂出去',
                kpiOffered: '在挂生产订单', kpiOfferedSub: '等供应商接单',
                missingTitle: '还没放上来的两个指标',
                missingText: '「已安排生产（产能没锁满）」和「待考察供应商（已提交材料）」在后端没有对应字段或状态。',
                missingSub: '口径定下来再放上来 —— 现在硬凑一个映射，数字看着像真的，但没人能解释它怎么算出来的。',
            },
            orders: {
                title: '订单', colCustomer: '客户', colCreated: '下单', colProd: '生产订单',
                colProgress: '进度', colPaid: '客户回款', unscheduled: '未安排',
                paid: '已回款', unpaid: '未回款',
                markDelivered: '标记已交付', registerPayment: '登记回款', empty: '还没有订单',
            },
            quotes: {
                title: '报价', tabSubmitted: '待报价', tabQuoted: '待客户确认', tabConfirmed: '已确认',
                orderCount: (n) => `${n} 单`,
                colQty: '总件数', colLead: '客户期望交期', colSubmitted: '提交时间', colQuote: '报价',
                leadDays: (n) => `${n} 天（仅参考）`, version: (n) => `第 ${n} 版`, never: '未报过',
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
                title: '交易方', suppliers: '供应商', supplierCount: (n) => `${n} 家`,
                colCompany: '企业', colDiscount: '折率', colProcess: '工艺', colMaterial: '材料',
                colSize: '尺寸范围', colPrecision: '精度等级', colDispatchable: '可派单', colOnboarded: '入驻',
                disabled: '已停用', notSet: '未设置', canDispatch: '可派单', missingDiscount: '缺折率',
                edit: '编辑', empty: '还没有供应商',
                emptySub: '在「供应商入驻」发邀请，对方注册后会出现在这里',
                editTitle: (name) => `编辑：${name}`,
                fldDiscount: '折率（对供价 = 原价 × 折率，0.8 = 八折）', discountPlaceholder: '如 0.8',
                fldProcess: '工艺', fldMaterial: '材料', fldSize: '尺寸范围', fldPrecision: '精度等级',
                freeText: '自由填写',
                discountHint: '折率录好这家就能被派单；能力可以以后补，只给派单时参考。',
                saved: (name) => `「${name}」已保存`,
                errDiscount: '折率请填大于 0、最多 4 位小数的数字，如 0.8', save: '保存',
            },
            accounts: {
                title: '账号管理',
                tabUsers: '外部用户', tabOrgs: '组织', tabStaff: '运营账号',
                search: '搜索', searchHint: '留空显示全部', query: '查询',
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
                fldPassword: '初始密码（至少 8 位）', fldCountry: '国家（两位代码，可选）',
                fldType: '类型',
                immutable: '（不可改）', immutableType: '（不可改：改类型等于改受众）',
                passwordRule: '至少 8 位',
                all: '全部', selectPlaceholder: '（请选择）',
                usersTotal: (n) => `${n} 个`, orgsTotal: (n) => `${n} 家`, staffTotal: (n) => `${n} 个`,
                noUsers: '还没有外部用户', noUsersSub: '点右上角「新建」创建第一个',
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
            errCurrency: '请选择币种', errLead: '交期请填正整数天数',
            errPrice: (code) => `「${code}」的原价请填大于 0、最多两位小数的数字`,
            savedMarkup: '加成率已保存，只影响之后发出的报价',
            confirmResend: '重新发出报价？客户手上待确认的那一版会作废。',
            confirmSend: '发出报价？客户会看到按最新汇率计算的价格，确认前随汇率变动。',
            sentVersion: (n) => `第 ${n} 版报价已发出`,
            lockedBanner: '客户已确认报价，价格和汇率已锁定，这一页只读。',
            cancelledBanner: '订单已取消，不能报价。',
            orderInfoTitle: '订单信息', fldCustomer: '客户', fldParts: '零件数',
            fldTotalQty: '总件数', fldLead: '客户期望交期', fldSubmitted: '提交时间',
            leadDays: (n) => `${n} 天（仅参考）`,
            markupTitle: '客户加成率', fldCurrent: '当前', fldUpdated: '最后修改', notSet: '未设置',
            markupPlaceholder: '如 1.2', save: '保存',
            markupNote: '对客价 = 原价 × 汇率 × 加成率。填 1.2 = 加价 20%，填 0.9 = 九折；大于 0，最多 4 位小数。',
            markupScope: '这是这个客户的值，改了只影响之后发出的报价。',
            quoteTitle: '零件', requoteTitle: '重新报价', fillQuote: '填报价', partsTitle: '零件',
            colPart: '零件', colMaterialSurface: '材料 / 表面处理', colBasePrice: '原价 ¥/件',
            colUnit: '对客单价', colSubtotal: '对客小计',
            customerRev: (v) => ` · 客户标记 ${v}`, pricePlaceholder: '¥ / 件',
            fldQuoteCurrency: '对客币种', fldLeadAfterConfirm: '交期（客户确认后）',
            dayUnit: '天', dayPlaceholder: '天',
            preview: (rateDate, eurCny, eurQuote, currency, markup, total) =>
                `试算：ECB ${rateDate} 汇率 1 EUR = ${eurCny} CNY${eurQuote ? ` = ${eurQuote} ${currency}` : ''}，加成率 × ${markup}，合计 ${total}。`,
            previewHint: '客户确认前，价格会随之后的汇率变动。',
            needMarkup: '这个客户还没设加成率', canProceed: '可以试算或发出',
            previewBtn: '按当前汇率试算', resendBtn: '重新发出', sendBtn: '发出报价',
            historyTitle: '报价记录', versionCount: (n) => `${n} 版`,
            colVersion: '版本', colCurrency: '币种', colLead: '交期', colMarkup: '加成率',
            colTotal: '对客总计', colRate: '汇率', colSentAt: '发出时间',
            markupTimes: (v) => `× ${v}`,
            rateLocked: '（确认时锁定）', rateUnlocked: '（最新，未锁定）', empty: '还没有报价',
        },
    prodDetail: {
        back: '← 派单管理', title: '生产订单', notFound: '生产订单不存在',
        dueProblem: '请填对供交期（如 2026-10-20）', errNoSupplier: '请勾选要派的供应商',
        confirmOffer: (n) => `定向派给 ${n} 家？先到先得，谁先接给谁。`, offered: '已定向派出',
        confirmPublish: '挂到全市场？所有可派单的供应商都看得到，先到先得。', published: '已挂全市场',
        confirmRecall: '收回？还没人接，收回后回到组装中。', recalled: '已收回',
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
        noSupplierAvailable: '还没有可派单的供应商', noSupplierAvailableSub: '到「交易方」给供应商录折率',
        offerDueLabel: '对供交期',
        publishBtn: '挂全市场', offerSelected: (n) => `定向派给选中的 ${n} 家`,
        offersOpen: '派单中', offersAccepted: '已被接下',
        colOfferedTo: '这一轮派给',
        marketNote: '挂在全市场，所有可派单的供应商都看得到，谁先接给谁。',
        acceptedNote: (name, when, due) => `「${name}」于 ${when} 接单，对供交期 ${due}。`,
        awaitingContract: (deadline) => `还没建合同。签字期限 ${deadline}（接单起 7 天），到点还没签字，系统会自动取消这张单、退回待派。`,
        awaitingSignature: (created, deadline) => `合同已建（${created}），等供应商签字。签字期限 ${deadline}，到点没签自动取消退回待派。`,
        signedNote: (when) => `供应商已于 ${when} 签字，单据锁定：收不回、改不了。生产、质检、发货还没做。`,
        createContract: '建合同', dropContract: '作废合同', recall: '收回',
        revokeSupplier: '收回供应商', ship: '发货', cancelHistory: '取消记录',
        colReason: '原因', colAcceptedAt: '接单', colCancelledAt: '取消',
    },
        errors: {
            'auth.bad_credentials': '账号或密码错误',
            'auth.otp_rate_limited': '发送太频繁，请稍后再试',
            'auth.otp_expired': '验证码已失效，请重新获取',
            'auth.otp_code_incorrect': '验证码不正确',
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
            loading: 'Loading…', retry: 'Retry', cancel: 'Cancel', create: 'Create',
            save: 'Save',
            untitledOrder: 'Untitled order',
            table: {
                name: 'Name', parts: 'Parts', quantity: 'Total qty', created: 'Created', status: 'Status',
                order: 'Order', totalPrice: 'Total', price: 'Price', leadTime: 'Lead time', quotedAt: 'Quoted at',
            },
        },
        customer: {
            home: {
                greeting: (name) => `Hello, ${name}`,
                newOrder: '+ New order',
                quotesPending: (n) => `${n} quote${n === 1 ? '' : 's'} awaiting your confirmation.`,
                viewQuotes: 'My quotes →',
                myOrders: 'My orders',
                orderCount: (n) => `${n} order${n === 1 ? '' : 's'}`,
                empty: 'No orders yet',
                createFirst: 'Create your first order',
            },
            orders: {
                title: 'My orders',
                sub: 'Add parts and drawings, then submit',
                count: (n) => `${n} order${n === 1 ? '' : 's'}`,
                newOrder: '+ New order', newTitle: 'New order',
                titlePlaceholder: 'Order name (optional)',
                cancelOrder: 'Cancel order',
                cancelConfirm: 'This cannot be undone. Cancel this order?',
                empty: 'No orders yet', emptySub: 'Create an order to add parts',
            },
        orderDetail: {
            notFound: 'Order not found', backToOrders: '← My orders',
            addPart: '+ Add part', addFirstPart: '+ Add a part',
            missingDrawingBanner: (n) => `${n} part${n === 1 ? '' : 's'} without drawings — all parts need drawings before submitting.`,
            submittedBanner: 'Order submitted. Drawing revisions are locked and can no longer be changed.',
            quotedBanner: 'We have sent a quote; it is waiting for your confirmation.', quoteLink: 'View quote →',
            confirmedBanner: 'Quote confirmed.', cancelledBanner: 'Order cancelled.',
            infoTitle: 'Order details',
            fldName: 'Name', fldLead: 'Requested lead time',
            leadPlaceholder: 'days (for reference)', titlePlaceholder: 'Order name',
            leadDays: (n) => `${n} days (for reference)`,
            fldParts: 'Parts', fldTotalQty: 'Total quantity', fldCreated: 'Created', fldSubmitted: 'Submitted',
            partsTitle: (n) => `${n} part${n === 1 ? '' : 's'}`, missingDrawingPill: (n) => `${n} missing drawing`,
            colRevision: 'Rev', colMaterial: 'Material', colDrawing: 'Drawing', colProgress: 'Progress',
            colCode: 'Drawing no.', colQty: 'Qty',
            customerRev: (v) => `Customer mark ${v}`,
            drawingUploaded: 'Drawing attached', drawingMissing: 'No drawing', remove: 'Remove',
            emptyParts: 'No parts yet', emptyPartsSub: 'Add parts and drawings, then submit',
            submitOrder: (n) => `Submit order (${n} part${n === 1 ? '' : 's'}) →`,
            needDrawings: (n) => `${n} part${n === 1 ? '' : 's'} still need drawings`,
            errLeadDays: 'Requested lead time must be a whole number of days',
        },
        partForm: {
            uploadFailed: 'Upload failed',
            errRequired: 'Drawing no., name and quantity are required; quantity must be at least 1',
            notFound: 'Part not found',
            titleNew: 'Add part', titleEdit: 'Edit part', titlePart: 'Part',
            versionLine: (code, rev) => `${code} · rev ${rev}`,
            lockedBanner: 'The order has been submitted or cancelled; parts can no longer be added.',
            reuseExisting: (name, rev, files) => `Part "${name}" already exists. Adding it to this order reuses revision ${rev} (${files} file${files === 1 ? '' : 's'}).`,
            reuseNewVersionQueued: 'You selected new files, so a new revision will be created for this order.',
            reuseNewVersion: (name) => `Part "${name}" already exists; a new drawing revision will be created for this order.`,
            infoTitle: 'Part details',
            fldCode: 'Drawing no. *', fldMaterial: 'Material', fldSurface: 'Surface finishing',
            codePlaceholder: 'Detected from the file name when possible', optionalPlaceholder: 'Optional',
            drawingTitle: 'Drawings',
            lockedPill: (rev) => `Rev ${rev} · locked`,
            hintNew: 'Selected files are uploaded after the part is added to the order',
            hintLocked: 'This revision was locked when the order was submitted. Changing drawings creates a new revision; earlier orders are unaffected',
            hintRequired: 'Each part needs at least one drawing before the order can be submitted',
            chooseDrawing: '+ Choose drawings', replaceDrawing: 'Change drawings (new revision)',
            noDrawing: 'No drawings yet', download: 'Download', removeTitle: 'Remove',
            cancel: 'Cancel', backToOrder: 'Back to order', addToOrder: 'Add to order', save: 'Save',
        },
            quotes: {
                title: 'My quotes',
                detailTitle: 'Quote', partsHeader: (n) => `${n} part${n === 1 ? '' : 's'}`,
                colCode: 'Drawing no.', colQty: 'Qty', colUnit: 'Unit price', colSubtotal: 'Subtotal', total: 'Total',
                reject: 'Reject quote', confirmPrice: (amount) => `Confirm price (${amount})`, fldRateDate: 'FX date',
                empty: 'No quotes yet',
                emptySub: 'Quotes appear here once you submit an order',
                noQuote: 'No quote yet',
                noQuoteSub: 'This order has no pending or confirmed quote',
                viewOrder: 'View order',
                locked: (d) => `Locked (FX date ${d})`,
                floating: (d) => `At the ${d} FX rate — subject to change until confirmed`,
                noRate: 'FX rate unavailable; the price will appear shortly',
                afterConfirm: (days) => `${days} days after confirmation`,
                rejectConfirm: 'Reject this quote? The order goes back and we will re-quote.',
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
            note: 'By continuing you agree to our Terms and Privacy Policy.',
            modePassword: 'Password', modeCode: 'Verification code',
            sendCode: 'Send code', codeSentTo: 'Code sent to', codeLabel: '6-digit code',
            backToEmail: '← Use another email', resend: 'Resend',
            resendIn: (sec) => `Resend in ${sec}s`,
            codeHint: 'The code is valid for 5 minutes and can be used once.',
            needsRegistration: 'This email does not have an account yet.',
            staffPrompt: 'Staff member?', staffLink: 'Sign in here',
        },
        reg: {
            h: 'Sign up', sub: 'Already have an account? ', subA: 'Sign in',
            email: 'Work email', code: 'Verification code', codeP: '6-digit code',
            sendCode: 'Send code', resend: 'Resend',
            resendIn: (sec) => `Resend in ${sec}s`,
            codeSentTo: (email) => `Code sent to ${email}`,
            hint: 'The code is valid for 5 minutes and can be used once. Accounts have no password — you sign in with an email code.',
            agree: 'I agree to the Terms and Privacy Policy',
            submit: 'Create account',
            errRequired: 'Please enter your email first',
            errCode: 'Enter the 6-digit code',
            errAgree: 'Please accept the Terms and Privacy Policy first',
            errTaken: 'This email is already registered — just sign in',
            errFailed: 'Sign-up failed. Please try again.',
            otherCountry: 'Other',
        },
        opsLogin: {
            brand: 'SONNENSCHEIN · Internal',
            h: 'Staff sign in',
            sub: 'Internal staff only. Accounts are created by an administrator; self sign-up is not available.',
            email: 'Work email', pw: 'Password', submit: 'Sign in',
            badCredentials: 'Incorrect email or password', failed: 'Sign-in failed. Please try again.',
        },
        status: {
            order: {
                DRAFT: 'Draft', SUBMITTED: 'Submitted', QUOTED: 'Quote pending',
                CONFIRMED: 'Quote confirmed', READY: 'Completed · awaiting shipment', CANCELLED: 'Cancelled',
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
            signDeadlineNote: (when) => `${when} (7 days after accepting)`,
            fldCancel: 'Cancelled',
            reworkLine: 'Rework / remake',
            start: 'Start', produced: 'Mark produced',
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
            SHIPPED: 'Received · awaiting QC', FULFILLED: 'All parts passed QC', CANCELLED: 'Cancelled',
        },
        line: {
            PENDING: 'Not started', IN_PRODUCTION: 'In production', PRODUCED: 'Produced · ready to ship',
            QC_PENDING: 'Awaiting QC', QC_PASSED: 'QC passed', SUPERSEDED: 'Superseded by a split',
            SCRAPPED: 'Scrapped', CANCELLED: 'Cancelled',
        },
        cancelReason: { WITHDRAWN: 'Withdrawn by supplier', REVOKED: 'Withdrawn by us', SIGN_TIMEOUT: 'Signature timeout' },
    },
    profile: {
        title: 'Profile', basic: 'Basic information', nickname: 'Nickname', email: 'Email', role: 'Role',
        joined: 'Joined', edit: 'Edit', save: 'Save', cancel: 'Cancel', saved: 'Saved',
    },
    misc: {
        notFoundTitle: 'This page does not exist',
        notFoundSub: 'The link may have expired, or you do not have access to this page.',
        backHome: 'Back to home',
        settings: 'Settings', appearance: 'Appearance', light: 'Light', dark: 'Dark',
        companyInfo: 'Company', companyName: 'Company name',
        companyNameHint: 'Not collected at sign-up. It appears on quotes, contracts and invoices — please fill it in before submitting an order.',
        companySaved: 'Company name saved',
    },
        nav: {
            settings: 'Settings', signOut: 'Sign out', profile: 'Profile',
            defaultUser: 'User', supplierFallback: 'Supplier',
            customer: { trade: 'Trade', overview: 'Overview', orders: 'Orders', quotes: 'Quotes' },
            supplier: {
                accept: 'Orders', orders: 'My orders', settlement: 'Settlement', bill: 'Reconciliation & invoicing',
                company: 'Company', profile: 'Company profile', hall: 'Order market', workspace: 'My workspace',
            },
            ops: {
                overview: 'Overview', dashboard: 'Dashboard', quoting: 'Quoting', quotes: 'Quotes',
                dispatch: 'Dispatch', execution: 'Execution', production: 'Production & QC', orders: 'Orders',
                masterData: 'Master data', parties: 'Parties', accounts: 'Accounts', internalOps: 'Internal · Operations',
            },
        },
        ops: {
            dashboard: {
                title: 'Dashboard',
                failedTitle: 'Could not load dashboard data.', failedBody: 'The numbers below are placeholders — do not schedule production based on them.',
                kpiPending: 'To schedule', kpiPendingSub: 'Price confirmed, waiting for us to assemble',
                kpiAssembling: 'Assembling', kpiAssemblingSub: 'Draft, not offered yet',
                kpiOffered: 'Open production orders', kpiOfferedSub: 'Waiting for a supplier',
                missingTitle: 'Two metrics not shown yet',
                missingText: '“Scheduled production (capacity not filled)” and “Suppliers under review” have no matching field or status in the backend.',
                missingSub: 'They come back once the definition is agreed — forcing a mapping now produces numbers that look real but cannot be explained.',
            },
            orders: {
                title: 'Orders', colCustomer: 'Customer', colCreated: 'Created', colProd: 'Production order',
                colProgress: 'Progress', colPaid: 'Customer payment', unscheduled: 'Not scheduled',
                paid: 'Paid', unpaid: 'Unpaid',
                markDelivered: 'Mark delivered', registerPayment: 'Record payment', empty: 'No orders yet',
            },
            quotes: {
                title: 'Quotes', tabSubmitted: 'To quote', tabQuoted: 'Awaiting customer', tabConfirmed: 'Confirmed',
                orderCount: (n) => `${n} order${n === 1 ? '' : 's'}`,
                colQty: 'Total qty', colLead: 'Requested lead time', colSubmitted: 'Submitted', colQuote: 'Quote',
                leadDays: (n) => `${n} days (reference)`, version: (n) => `v${n}`, never: 'Never quoted',
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
                title: 'Parties', suppliers: 'Suppliers', supplierCount: (n) => `${n}`,
                colCompany: 'Company', colDiscount: 'Discount', colProcess: 'Processes', colMaterial: 'Materials',
                colSize: 'Size range', colPrecision: 'Precision', colDispatchable: 'Dispatchable', colOnboarded: 'Joined',
                disabled: 'Disabled', notSet: 'Not set', canDispatch: 'Dispatchable', missingDiscount: 'No discount rate',
                edit: 'Edit', empty: 'No suppliers yet',
                emptySub: 'Invite one under “Supplier onboarding”; they appear here after signing up',
                editTitle: (name) => `Edit: ${name}`,
                fldDiscount: 'Discount rate (supplier price = base price × rate; 0.8 = 20% off)', discountPlaceholder: 'e.g. 0.8',
                fldProcess: 'Processes', fldMaterial: 'Materials', fldSize: 'Size range', fldPrecision: 'Precision grade',
                freeText: 'Free text',
                discountHint: 'A supplier can be dispatched once a discount rate is set; capabilities are optional and only used as a reference.',
                saved: (name) => `${name} saved`,
                errDiscount: 'Enter a discount rate greater than 0 with at most 4 decimals, e.g. 0.8', save: 'Save',
            },
            accounts: {
                title: 'Accounts',
                tabUsers: 'External users', tabOrgs: 'Organizations', tabStaff: 'Staff accounts',
                search: 'Search', searchHint: 'Leave blank to list everything', query: 'Search',
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
                fldPassword: 'Initial password (min 8 chars)', fldCountry: 'Country (2-letter code, optional)',
                fldType: 'Type',
                immutable: ' (cannot be changed)', immutableType: ' (cannot be changed: type defines the audience)',
                passwordRule: 'Min 8 characters',
                all: 'All', selectPlaceholder: '(select)',
                usersTotal: (n) => `${n}`, orgsTotal: (n) => `${n}`, staffTotal: (n) => `${n}`,
                noUsers: 'No external users yet', noUsersSub: 'Use “New” in the top-right corner to create one',
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
            errCurrency: 'Please choose a currency', errLead: 'Lead time must be a whole number of days',
            errPrice: (code) => `Enter a base price above 0 with at most 2 decimals for ${code}`,
            savedMarkup: 'Markup rate saved. It only affects quotes sent from now on.',
            confirmResend: 'Send the quote again? The version awaiting the customer will be superseded.',
            confirmSend: 'Send this quote? The customer sees prices at the latest FX rate; they may change until confirmed.',
            sentVersion: (n) => `Quote v${n} sent`,
            lockedBanner: 'The customer confirmed this quote. Prices and FX are locked; this page is read-only.',
            cancelledBanner: 'The order was cancelled and cannot be quoted.',
            orderInfoTitle: 'Order details', fldCustomer: 'Customer', fldParts: 'Parts',
            fldTotalQty: 'Total quantity', fldLead: 'Requested lead time', fldSubmitted: 'Submitted',
            leadDays: (n) => `${n} days (reference)`,
            markupTitle: 'Customer markup', fldCurrent: 'Current', fldUpdated: 'Last changed', notSet: 'Not set',
            markupPlaceholder: 'e.g. 1.2', save: 'Save',
            markupNote: 'Customer price = base price × FX rate × markup. 1.2 = +20%; 0.9 = 10% off. Must be > 0, up to 4 decimals.',
            markupScope: 'This value belongs to this customer and only affects quotes sent from now on.',
            quoteTitle: 'Parts', requoteTitle: 'Re-quote', fillQuote: 'Enter quote', partsTitle: 'Parts',
            colPart: 'Part', colMaterialSurface: 'Material / finishing', colBasePrice: 'Base ¥/pc',
            colUnit: 'Customer unit price', colSubtotal: 'Customer subtotal',
            customerRev: (v) => ` · customer mark ${v}`, pricePlaceholder: '¥ / pc',
            fldQuoteCurrency: 'Customer currency', fldLeadAfterConfirm: 'Lead time (after confirmation)',
            dayUnit: 'days', dayPlaceholder: 'days',
            preview: (rateDate, eurCny, eurQuote, currency, markup, total) =>
                `Preview: ECB rate on ${rateDate} is 1 EUR = ${eurCny} CNY${eurQuote ? ` = ${eurQuote} ${currency}` : ''}, markup × ${markup}, total ${total}.`,
            previewHint: 'Prices may change with later FX rates until the customer confirms.',
            needMarkup: 'No markup rate set for this customer yet', canProceed: 'You can preview or send',
            previewBtn: 'Preview at current rate', resendBtn: 'Send again', sendBtn: 'Send quote',
            historyTitle: 'Quote history', versionCount: (n) => `${n} version${n === 1 ? '' : 's'}`,
            colVersion: 'Version', colCurrency: 'Currency', colLead: 'Lead time', colMarkup: 'Markup',
            colTotal: 'Customer total', colRate: 'FX rate', colSentAt: 'Sent at',
            markupTimes: (v) => `× ${v}`,
            rateLocked: ' (locked at confirmation)', rateUnlocked: ' (latest, not locked)', empty: 'No quotes yet',
        },
    prodDetail: {
        back: '← Dispatch', title: 'Production order', notFound: 'Production order not found',
        dueProblem: 'Enter the supplier due date (e.g. 2026-10-20)', errNoSupplier: 'Select at least one supplier',
        confirmOffer: (n) => `Offer to ${n} supplier${n === 1 ? '' : 's'}? First come, first served.`, offered: 'Offered',
        confirmPublish: 'Publish to the open market? Every dispatchable supplier can see it. First come, first served.', published: 'Published to market',
        confirmRecall: 'Withdraw? Nobody has accepted it yet; it goes back to assembling.', recalled: 'Withdrawn',
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
        noSupplierAvailable: 'No dispatchable suppliers yet', noSupplierAvailableSub: 'Set discount rates under “Parties”',
        offerDueLabel: 'Supplier due date',
        publishBtn: 'Publish to market', offerSelected: (n) => `Offer to ${n} selected`,
        offersOpen: 'Dispatching', offersAccepted: 'Accepted',
        colOfferedTo: 'Offered to',
        marketNote: 'Published to the open market — every dispatchable supplier can see it, first come first served.',
        acceptedNote: (name, when, due) => `${name} accepted on ${when}, supplier due date ${due}.`,
        awaitingContract: (deadline) => `No contract yet. Signature deadline ${deadline} (7 days after acceptance); if unsigned by then the order is cancelled and re-dispatched automatically.`,
        awaitingSignature: (created, deadline) => `Contract created (${created}), awaiting the supplier's signature. Deadline ${deadline}; if unsigned by then the order is cancelled and re-dispatched.`,
        signedNote: (when) => `Signed by the supplier on ${when}. The order is locked: it cannot be revoked or changed. Production, QC and shipping are not built yet.`,
        createContract: 'Create contract', dropContract: 'Cancel contract', recall: 'Withdraw',
        revokeSupplier: 'Revoke supplier', ship: 'Ship', cancelHistory: 'Cancellation history',
        colReason: 'Reason', colAcceptedAt: 'Accepted', colCancelledAt: 'Cancelled',
    },
        errors: {
            'auth.bad_credentials': 'Incorrect email or password',
            'auth.otp_rate_limited': 'Too many requests. Please try again later.',
            'auth.otp_expired': 'The code has expired. Please request a new one.',
            'auth.otp_code_incorrect': 'Incorrect code.',
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
