/**
 * 展示层格式化。原型里的 X / M / N / today / now / plus / money / sum。
 *
 * ★ 数字一律用 tabular-nums 等宽渲染（见 styles.css 的 .n / var(--mono)），
 *   金额列上下对齐才能一眼扫出量级 —— 表格里对不齐的数字等于没给。
 *
 * ★ 时间全部按**本地时区**格式化，不用 toISOString()。
 *   原型用的是 toISOString().slice()，那是 UTC：在 UTC+8 下，
 *   下午 2 点的操作会记成 06:xx，早上 8 点前的「今天」会变成昨天。
 *   更糟的是 dueDate() 又把这个 UTC 字符串按本地时区解析回去，
 *   两头不一致，应付日直接差一天 —— 供应商照着排现金流的那个日期。
 *
 *   接真后端时这里换成后端返的 ISO 8601（带时区）再本地化，
 *   不要退回裸 toISOString()。
 */

/** 占位符。原型里所有「没有值」的地方都显示它，而不是空白。 */
export const X = '——'

/** 千分位 + 固定小数位。非数字返回占位符。 */
export const M = (v: unknown, d = 2): string =>
    typeof v === 'number'
        ? v.toLocaleString('zh-CN', { minimumFractionDigits: d, maximumFractionDigits: d })
        : (v as string) || X

export const money = (v: number, sym = '€') => `${sym} ${M(v)}`

const pad = (n: number) => String(n).padStart(2, '0')

/** 本地日期 YYYY-MM-DD */
export const fmtDate = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** 本地日期时间 YYYY-MM-DD HH:mm */
export const fmtDateTime = (d: Date) =>
    `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`

export const today = () => fmtDate(new Date())

export const now = () => fmtDateTime(new Date())

/** 今天起 d 天后的日期 */
export const plus = (d: number) => fmtDate(new Date(Date.now() + d * 864e5))

/** N 小时后的时间戳（fmtDateTime 格式）。抢单截止用它 —— 24 小时就是 24 小时，不凑整到天。 */
export const plusHours = (h: number) => fmtDateTime(new Date(Date.now() + h * 36e5))

/**
 * 解析本仓存下来的时间戳（fmtDateTime 的产物）。
 * 「YYYY-MM-DD HH:mm」不带时区，JS 按本地时区解析 —— 和写入时一致。
 */
export const parseStamp = (s: string) => new Date(s.replace(' ', 'T'))

export const sum = <T,>(a: T[], f: (x: T) => number) => a.reduce((s, x) => s + f(x), 0)

/**
 * 派单包的真实剩余时间。
 *
 * ★ 之前界面上写的是「剩 24 小时」—— 那是平台参数 grabHours，不是这个包
 *   还剩多久，挂了三天的包也显示剩 24 小时。供应商靠这个判断急不急，
 *   给个假数字比不给更糟。这里按 exp（到期日）真算。
 */
export const hoursLeft = (exp: string | undefined): number | null => {
    // 草稿态的生产订单还没挂出去，没有截止时刻 —— 返回 null，界面不显示倒计时
    if (!exp) return null
    // exp 是带时间的时间戳（fmtDateTime 产物）；纯日期按当天结束算
    const end = exp.includes(' ')
        ? parseStamp(exp).getTime()
        : new Date(`${exp}T23:59:59`).getTime()
    const h = Math.ceil((end - Date.now()) / 36e5)
    return h > 0 ? h : 0
}
