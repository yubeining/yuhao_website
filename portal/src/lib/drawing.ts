/**
 * 图纸文件名解析。
 *
 * ★ 规则全部来自设计文档 9 §4.3 —— 那是逐个核对 197 个真实图纸文件得出的，
 *   不是猜的命名约定。样本里有五种风格：
 *
 *     模型_4_1_LB8.605.63529_A_(密级为空)_860563529.par   56 个
 *     835460372.par                                      51 个   ← 纯数字，不含图号原文
 *     LB860062384-垫圈.pdf                                38 个   ← 紧凑写法
 *     A2_dft_7_1_LB8.034.60696_A_(非密)_803460696_print.pdf 31 个
 *     GB9074'8_3X8.prt                                    9 个   ← 无规律
 *
 * ★ 关键洞察：纯数字 ID 就是图号去掉 LB 和小数点。
 *     860563529 ↔ LB8.605.63529      803460696 ↔ LB8.034.60696
 *   所以把两边都归一成纯数字串再比，五种风格里的四种用同一条规则就能匹配。
 *
 * ★★ 这条规则只在**一个客户**身上验证过（文档 9 Q20）。
 *   不要假设它对所有客户成立 —— 匹配不上的一律走手工指派，不要猜。
 */

/** 归一化：只留数字。`LB8.605.63529` / `860563529` → `860563529` */
export const normalizePartNo = (s: string) => (s || '').replace(/\D/g, '')

export interface ParsedName {
    /** 从文件名里认出来的图号（归一化后的数字串），认不出为空 */
    partDigits: string
    /** 从文件名里认出来的版本号，认不出为空 */
    rev: string
}

/**
 * 解析一个图纸文件名。
 *
 * 版本号的位置：图号后面紧跟的单个大写字母或短数字，且后面跟着密级标记。
 * 只在这个位置取 —— 文件名里别处的大写字母（`A3_`、`_print`）不是版本。
 */
export function parseDrawingName(fileName: string): ParsedName {
    const base = fileName.replace(/\.[^.]+$/, '')

    // 风格 ①②④：图号写成 LB8.605.63529，后面可能跟版本和密级
    const withDots = base.match(/(LB[\d.]*\d)(?:_([A-Z0-9]{1,3}))?(?=_[（(]|_|$)/)
    if (withDots) {
        return { partDigits: normalizePartNo(withDots[1]), rev: withDots[2] || '' }
    }

    // 风格 ③：LB860062384-垫圈 / LB8.322.60012定滑轮（点写法但后面直接跟中文）
    const compact = base.match(/LB([\d.]{6,})/)
    if (compact) return { partDigits: normalizePartNo(compact[1]), rev: '' }

    // 风格 ④变体：纯数字文件名
    const bare = base.match(/^(\d{6,})$/)
    if (bare) return { partDigits: bare[1], rev: '' }

    return { partDigits: '', rev: '' }
}

/** 一个零件：由若干同图号的文件聚成 */
export interface DrawingGroup {
    /** 归一化后的图号数字串 */
    partDigits: string
    /** 文件名里出现过的图号原文，取最完整的一个 */
    partNo: string
    rev: string
    files: { name: string; size: number; revFromName: string }[]
}

/**
 * 把一批文件按图号聚成零件。
 *
 * ★ 这是这一页的核心动作：真实数据里一个零件平均 3 个文件
 *   （58 个零件 / 185 个文件），客户是整批发过来的。
 *   让人一个个把文件配到行上是不可能完成的操作。
 *
 * ★ 认不出图号的文件单独返回，不硬塞给任何零件 ——
 *   样本里那 6 个认不出的是标准件和一个 Excel，本来就不该配。
 */
export function groupByPart(
    files: { name: string; size: number }[],
): { groups: DrawingGroup[]; orphans: { name: string; size: number; revFromName: string }[] } {
    const map = new Map<string, DrawingGroup>()
    const orphans: { name: string; size: number; revFromName: string }[] = []

    for (const f of files) {
        const { partDigits, rev } = parseDrawingName(f.name)
        if (!partDigits) {
            orphans.push({ ...f, revFromName: rev })
            continue
        }
        let g = map.get(partDigits)
        if (!g) {
            g = { partDigits, partNo: '', rev: '', files: [] }
            map.set(partDigits, g)
        }
        g.files.push({ ...f, revFromName: rev })
        // 版本取第一个解析出来的 —— 同一零件的多个文件版本应当一致
        if (rev && !g.rev) g.rev = rev
        const written = readablePartNo(f.name)
        if (written.length > g.partNo.length) g.partNo = written
    }
    return { groups: [...map.values()], orphans }
}

/**
 * 从文件名里取人能读的图号原文（带 LB 和点的那种）。
 * 取不到就返回空 —— 纯数字文件名还原出来的图号是我方推的，不能当成客户写的。
 */
function readablePartNo(fileName: string): string {
    const m = fileName.match(/LB\d+(?:\.\d+)+/)
    return m ? m[0] : ''
}

/** 人看的文件大小 */
export const humanSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
