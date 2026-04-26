interface SidebarFooterProps {
    onOpenTaskCenter: () => void
    onOpenFilter: () => void
    onOpenReviewCenter: () => void
    onOpenBackup: () => void
    onHotkey: () => void
    onOpenKnowledgeGraph: () => void
    isDark: boolean
    onToggleTheme: () => void
}

export function SidebarFooter({ onOpenTaskCenter, onOpenFilter, onOpenReviewCenter, onOpenBackup, onHotkey, onOpenKnowledgeGraph, isDark, onToggleTheme }: SidebarFooterProps) {
    const navRow = (icon: string, label: string, onClick: () => void, title?: string) => (
        <button
            onClick={onClick}
            title={title}
            style={{
                width: '100%', height: 34, display: 'flex', alignItems: 'center', gap: 9,
                padding: '0 12px', border: 'none', background: 'transparent', cursor: 'pointer',
                borderRadius: 0, textAlign: 'left',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.045)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
            <span style={{ fontSize: 14, width: 18, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</span>
        </button>
    )

    return (
        <div style={{ borderTop: '1px solid var(--border-light)', flexShrink: 0, paddingBottom: 2 }}>
            {navRow('📔', '復盤中心', onOpenReviewCenter, '復盤中心 (Ctrl+Shift+C)')}
            {navRow('✅', '任務中心', onOpenTaskCenter)}
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
            </div>
        </div>
    )
}
