import { useState } from 'react'

interface SidebarFooterProps {
    onOpenTaskCenter: () => void
    onOpenFilter: () => void
    onOpenReviewCenter: () => void
    onOpenBackup: () => void
    onHotkey: () => void
    onOpenKnowledgeGraph: () => void
    onOpenCardLibrary: () => void
    isDark: boolean
    onToggleTheme: () => void
    overdueCount: number
    todayCount: number
    onOpenOnboarding: () => void
}

export function SidebarFooter({ onOpenTaskCenter, onOpenFilter, onOpenReviewCenter, onOpenBackup, onHotkey, onOpenKnowledgeGraph, onOpenCardLibrary, isDark, onToggleTheme, overdueCount, todayCount, onOpenOnboarding }: SidebarFooterProps) {
    const [moreMenuOpen, setMoreMenuOpen] = useState(false)
    const hoverBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.045)'

    const navRow = (icon: string, label: string, onClick: () => void, title?: string) => (
        <button
            onClick={onClick}
            title={title}
            style={{
                width: '100%', height: 34, display: 'flex', alignItems: 'center', gap: 9,
                padding: '0 12px', border: 'none', background: 'transparent', cursor: 'pointer',
                borderRadius: 0, textAlign: 'left',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
            <span style={{ fontSize: 14, width: 18, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</span>
        </button>
    )

    const badgeCount = overdueCount > 0 ? overdueCount : todayCount
    const badgeColor = overdueCount > 0 ? '#ef4444' : '#f97316'
    const badgeLabel = badgeCount > 99 ? '99+' : String(badgeCount)

    return (
        <div style={{ borderTop: '1px solid var(--border-light)', flexShrink: 0, paddingBottom: 2 }}>
            {navRow('📔', '復盤中心', onOpenReviewCenter, '復盤中心 (Ctrl+Shift+C)')}
            <button
                onClick={onOpenTaskCenter}
                style={{
                    width: '100%', height: 34, display: 'flex', alignItems: 'center', gap: 9,
                    padding: '0 12px', border: 'none', background: 'transparent', cursor: 'pointer',
                    borderRadius: 0, textAlign: 'left',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
                <span style={{ fontSize: 14, width: 18, textAlign: 'center', flexShrink: 0 }}>✅</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>任務中心</span>
                {badgeCount > 0 && (
                    <span style={{
                        marginLeft: 'auto',
                        background: badgeColor,
                        color: 'white',
                        fontSize: 10, fontWeight: 700,
                        borderRadius: 999,
                        padding: '1px 6px',
                        minWidth: 18, textAlign: 'center',
                        lineHeight: '16px',
                        flexShrink: 0,
                    }}>
                        {badgeLabel}
                    </span>
                )}
            </button>
            {navRow('🕸️', '知識圖譜', onOpenKnowledgeGraph, '知識圖譜 (Ctrl+Shift+G)')}
            <div style={{ display: 'flex', justifyContent: 'space-around', padding: '4px 12px 4px', borderTop: '1px solid var(--border-light)', marginTop: 2 }}>
                {([
                    { icon: '🔍', title: '篩選卡片', fn: onOpenFilter },
                    { icon: '🔒', title: '自動備份', fn: onOpenBackup },
                    { icon: '⌨️', title: '快捷鍵', fn: onHotkey },
                ] as { icon: string; title: string; fn: () => void }[]).map(({ icon, title, fn }) => (
                    <button
                        key={title}
                        onClick={fn}
                        title={title}
                        style={{
                            width: 28, height: 28, borderRadius: 7, border: 'none',
                            background: 'transparent', cursor: 'pointer', fontSize: 14,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >{icon}</button>
                ))}
                <button
                    onClick={onToggleTheme}
                    title={isDark ? '切換亮色模式' : '切換暗色模式'}
                    style={{
                        width: 28, height: 28, borderRadius: 7, border: 'none',
                        background: 'transparent', cursor: 'pointer', fontSize: 14,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >{isDark ? '☀️' : '🌙'}</button>
                <div style={{ position: 'relative' }}>
                    <button
                        onClick={() => setMoreMenuOpen(v => !v)}
                        title="更多選項"
                        style={{
                            width: 28, height: 28, borderRadius: 7, border: 'none',
                            background: moreMenuOpen ? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)') : 'transparent',
                            cursor: 'pointer', fontSize: 14,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                            color: 'var(--text-muted)',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)')}
                        onMouseLeave={e => (e.currentTarget.style.background = moreMenuOpen ? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)') : 'transparent')}
                    >⋯</button>
                    {moreMenuOpen && (
                        <>
                            <div style={{ position: 'fixed', inset: 0, zIndex: 99997 }} onClick={() => setMoreMenuOpen(false)} />
                            <div style={{
                                position: 'absolute', bottom: 34, right: 0,
                                background: isDark ? '#1e293b' : 'white',
                                border: `1px solid ${isDark ? '#334155' : 'rgba(0,0,0,0.08)'}`,
                                borderRadius: 10, padding: '4px 0',
                                boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                                zIndex: 99998, minWidth: 160,
                            }}>
                                <div
                                    onClick={() => { setMoreMenuOpen(false); onOpenCardLibrary() }}
                                    style={{
                                        padding: '7px 14px', cursor: 'pointer',
                                        fontSize: 13, color: 'var(--text-primary)',
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        borderRadius: 6,
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : '#f5f5f5')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                    🗂️ 卡片庫
                                </div>
                                <div
                                    onClick={() => { setMoreMenuOpen(false); onOpenOnboarding() }}
                                    style={{
                                        padding: '7px 14px', cursor: 'pointer',
                                        fontSize: 13, color: 'var(--text-primary)',
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        borderRadius: 6,
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : '#f5f5f5')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                    📖 使用導覽
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
