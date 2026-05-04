import { useState } from 'react'

interface SidebarFooterProps {
    onOpenFilter: () => void
    onOpenBackup: () => void
    onHotkey: () => void
    isDark: boolean
    onToggleTheme: () => void
    onOpenOnboarding: () => void
}

export function SidebarFooter({ onOpenFilter, onOpenBackup, onHotkey, isDark, onToggleTheme, onOpenOnboarding }: SidebarFooterProps) {
    const [moreMenuOpen, setMoreMenuOpen] = useState(false)
    const iconBtnStyle = {
        width: 28, height: 28, borderRadius: 7, border: 'none',
        background: 'transparent', cursor: 'pointer', fontSize: 14,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    } as const
    const iconHoverBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'

    return (
        <div style={{ borderTop: '1px solid var(--border-light)', flexShrink: 0, paddingBottom: 2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-around', padding: '4px 12px' }}>
                {([
                    { icon: '🔍', title: '篩選卡片', fn: onOpenFilter },
                    { icon: '🔒', title: '自動備份', fn: onOpenBackup },
                    { icon: '⌨️', title: '快捷鍵', fn: onHotkey },
                ] as { icon: string; title: string; fn: () => void }[]).map(({ icon, title, fn }) => (
                    <button
                        key={title}
                        onClick={fn}
                        title={title}
                        style={iconBtnStyle}
                        onMouseEnter={e => (e.currentTarget.style.background = iconHoverBg)}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >{icon}</button>
                ))}
                <button
                    onClick={onToggleTheme}
                    title={isDark ? '切換亮色模式' : '切換暗色模式'}
                    style={iconBtnStyle}
                    onMouseEnter={e => (e.currentTarget.style.background = iconHoverBg)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >{isDark ? '☀️' : '🌙'}</button>
                <div style={{ position: 'relative' }}>
                    <button
                        onClick={() => setMoreMenuOpen(v => !v)}
                        title="更多選項"
                        style={{
                            ...iconBtnStyle,
                            background: moreMenuOpen ? iconHoverBg : 'transparent',
                            color: 'var(--text-muted)',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = iconHoverBg)}
                        onMouseLeave={e => (e.currentTarget.style.background = moreMenuOpen ? iconHoverBg : 'transparent')}
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
