/**
 * Design Token 的型別安全取用介面（TD8）。
 *
 * 用法：`style={{ background: T.bgPanel, color: T.textPrimary }}`
 * 值本身是 `var(--…)` 字串，實際色值由 tokens.css 依 <html data-theme> 決定，
 * 所以元件**不需要知道現在是不是暗色模式**——別再寫 `isDark ? '#1e293b' : '#fff'`。
 *
 * 要新增 token：tokens.css 兩個區塊（:root / [data-theme="dark"]）各加一行，這裡加對應鍵。
 */
export const T = {
    // 表面
    bgCanvas: 'var(--bg-canvas)',
    bgDot: 'var(--bg-dot)',
    bgApp: 'var(--bg-app)',
    bgPanel: 'var(--bg-panel)',
    bgCard: 'var(--bg-card)',
    bgSidebar: 'var(--bg-sidebar)',
    bgHover: 'var(--bg-hover)',
    bgCardHover: 'var(--bg-card-hover)',
    bgHoverSoft: 'var(--bg-hover-soft)',
    bgMuted: 'var(--bg-muted)',
    bgOverlay: 'var(--bg-overlay)',
    bgActive: 'var(--bg-active)',
    textOnActive: 'var(--text-on-active)',

    // 邊框
    borderLight: 'var(--border-light)',
    borderMid: 'var(--border-mid)',

    // 文字
    textPrimary: 'var(--text-primary)',
    textSecondary: 'var(--text-secondary)',
    textMuted: 'var(--text-muted)',

    // 強調色
    accent: 'var(--accent)',
    accentBg: 'var(--accent-bg)',
    accentBgStrong: 'var(--accent-bg-strong)',
    accentBorder: 'var(--accent-border)',

    // 狀態色
    danger: 'var(--danger)',
    dangerBg: 'var(--danger-bg)',
    dangerBgSoft: 'var(--danger-bg-soft)',
    dangerBorder: 'var(--danger-border)',
    warnBg: 'var(--warn-bg)',
    successBg: 'var(--success-bg)',

    // 陰影
    shadowHairline: 'var(--shadow-hairline)',
    shadowSm: 'var(--shadow-sm)',
    shadowMd: 'var(--shadow-md)',
    shadowLg: 'var(--shadow-lg)',
    shadowXl: 'var(--shadow-xl)',
    shadowModal: 'var(--shadow-modal)',
    shadowUp: 'var(--shadow-up)',
    ringSubtle: 'var(--ring-subtle)',
    shadowCard: 'var(--shadow-card)',
    shadowPanel: 'var(--shadow-panel)',

    // 圓角
    radiusSm: 'var(--radius-sm)',
    radiusCard: 'var(--radius-card)',
} as const

export type TokenName = keyof typeof T
