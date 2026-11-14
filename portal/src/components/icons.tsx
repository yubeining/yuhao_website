/**
 * 少量内联图标。
 *
 * ★ 为什么内联 SVG 而不是图标库：全站只有一个默认头像要用，引一个图标库
 *   等于为 15 行代码加几百 KB 依赖；内联还能直接吃 currentColor，跟着主题变。
 */

/**
 * 默认头像 —— 人形剪影。
 *
 * 刻意做成「中性、无身份」：不用姓名首字母（数字邮箱会露出 `0` 这种），
 * 也不用品牌 logo（那会被误读成公司标识）。所有账号共用同一个。
 */
export function UserGlyph({ size = 14 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <circle cx="12" cy="7.6" r="4.1" fill="currentColor" />
            <path
                d="M12 13.9c-4.2 0-7.4 2.4-8.1 5.6-.1.6.4 1.1 1 1.1h14.2c.6 0 1.1-.5 1-1.1-.7-3.2-3.9-5.6-8.1-5.6z"
                fill="currentColor"
            />
        </svg>
    )
}
