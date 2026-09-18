/**
 * 品牌资产与图形。全部内联 SVG，逐字移植自原型。
 *
 * ★ 不引图片文件也不引图标库：这些图形要跟着 currentColor 走，
 *   深浅色切换时自动改色。位图做不到，图标库要为四个字形拖进整个包。
 */

/** 厂房 + 零件的组合标记。stroke 用 currentColor，放哪儿都跟随文字色。 */
export const Logo = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
        strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
        <path d="M5.6 4.6h8.2l4.6 4.6v10.2H5.6z" />
        <path d="M13.8 4.6v4.6h4.6" />
        <circle cx="11.4" cy="13.4" r="3.1" />
    </svg>
)

/**
 * 图纸位。
 *
 * ★★ 这里绝不画零件形状。
 *
 *   原型里放的是四张写死的线稿，按下标循环取。那是错的，而且是危险的错：
 *   订单市场是供应商决定接不接这一单的地方，画一个跟真实零件毫无关系的形状，
 *   等于给他一个假的形状参考。他照着估工时、估装夹，估出来的数是错的。
 *   位次一变图还会跟着换，同一个零件今天圆盘明天方块。
 *
 *   在有真实缩略图来源（图纸首页渲染图）之前，这里只说明
 *   「有几个什么格式的文件」，不暗示零件长什么样。
 */

/** 图纸文件的格式与份数。没有就是没有，不编。 */
export interface DrawingRef {
    /** 扩展名，大写，如 PDF / STEP */
    kind: string
    count: number
}

const SHEET = (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.6"
        strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
        <path d="M13 6h15l7 7v29H13z" />
        <path d="M28 6v7h7" />
        <path d="M18 24h12M18 30h12M18 36h7" />
    </svg>
)

/**
 * 列表卡片里的图纸位。只显示格式和份数。
 * files 为空时明说「暂无图纸」，不用图形填空。
 */
export function DrawingSlot({ files }: { files: DrawingRef[] }) {
    const total = files.reduce((s, f) => s + f.count, 0)
    return (
        <div className="dslot">
            <div className="dslot-ic">{SHEET}</div>
            {total ? (
                <>
                    <div className="dslot-t">{files.map((f) => `${f.kind} ×${f.count}`).join(' · ')}</div>
                    <div className="dslot-s">共 {total} 个文件</div>
                </>
            ) : (
                <div className="dslot-s">暂无图纸</div>
            )}
        </div>
    )
}

/**
 * 详情页的图纸位。比列表版多一行提示：文件要下载后用本地软件打开。
 * mark 是脱敏水印文字，只在对外可见的地方传。
 */
export function DrawingPanel({ files, mark }: { files: DrawingRef[]; mark?: string }) {
    const total = files.reduce((s, f) => s + f.count, 0)
    return (
        <div className="dw">
            <div className="dslot">
                <div className="dslot-ic">{SHEET}</div>
                {total ? (
                    <>
                        <div className="dslot-t">{files.map((f) => `${f.kind} ×${f.count}`).join(' · ')}</div>
                        <div className="dslot-s">下载后用本地 CAD 软件打开</div>
                    </>
                ) : (
                    <div className="dslot-s">暂无图纸</div>
                )}
            </div>
            {mark && <div className="wmk">{mark}</div>}
        </div>
    )
}

const IC_WX = (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M9 3C4.9 3 1.6 5.9 1.6 9.4c0 2 1.1 3.8 2.9 5L3.8 16.6l2.6-1.3c.8.2 1.7.4 2.6.4h.5a5.6 5.6 0 0 1-.2-1.5c0-3.3 3.2-6 7.1-6h.6C16.3 5.3 13 3 9 3Zm-2.4 3a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm4.8 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
        <path d="M22.4 14.2c0-2.9-2.8-5.2-6.2-5.2s-6.2 2.3-6.2 5.2 2.8 5.2 6.2 5.2c.7 0 1.4-.1 2.1-.3l2.2 1.1-.6-1.8c1.5-1 2.5-2.5 2.5-4.2Zm-8.3-1.5a.85.85 0 1 1 0 1.7.85.85 0 0 1 0-1.7Zm4.2 0a.85.85 0 1 1 0 1.7.85.85 0 0 1 0-1.7Z" />
    </svg>
)

const IC_GG = (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 11v2.6h4.3c-.2 1.1-1.4 3.3-4.3 3.3-2.6 0-4.7-2.1-4.7-4.8S9.4 7.4 12 7.4c1.5 0 2.5.6 3 1.2l2-2C15.8 5.4 14.1 4.7 12 4.7 7.9 4.7 4.6 8 4.6 12.1S7.9 19.5 12 19.5c4.3 0 7.1-3 7.1-7.2 0-.5 0-.9-.1-1.3H12Z" />
    </svg>
)

export const OAuthIcons = { wechat: IC_WX, google: IC_GG }

/** 品牌侧栏里那条 S 形流程线的节点坐标：[圆心 x, 圆心 y, 文字 x] */
const NODES: [number, number, number][] = [
    [440, 90, 480], [200, 250, 240], [440, 410, 480], [200, 570, 240],
]

/** 登录 / 注册页左侧的深色品牌栏。窄屏隐藏（见 styles.css 的 .auth 媒体查询）。 */
export function BrandSide({ flow }: { flow: string[] }) {
    return (
        <div className="brandside">
            <div className="bmark">
                <div className="gl"><Logo /></div>
                <div>
                    <div className="nm">融一智造</div>
                    <div className="sb">CROSS-BORDER MANUFACTURING</div>
                </div>
            </div>
            <div className="bflow">
                <svg viewBox="0 0 660 640" role="img" aria-label="flow">
                    <path className="ln" d="M440 90 C440 180 200 160 200 250
                        C200 340 440 320 440 410 C440 500 200 480 200 570" />
                    {NODES.map(([cx, cy, tx], i) => (
                        <g key={i}>
                            <circle className="nd" cx={cx} cy={cy} r="7" />
                            <text className="st" x={tx} y={cy + 8}>{flow[i]}</text>
                        </g>
                    ))}
                </svg>
            </div>
        </div>
    )
}
