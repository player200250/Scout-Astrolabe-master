import { useState } from 'react'
import { Z_CLICK_AWAY, Z_MODAL_BACKDROP } from '../constants'
import type { PanelName } from '../hooks/usePanelState'
import { T } from '../theme/tokens'
import { useIsDark } from '../theme/ThemeContext'

interface SidebarFooterProps {
    onOpenPanel: (name: PanelName) => void
    onToggleTheme: () => void
}

export function SidebarFooter({ onOpenPanel,  onToggleTheme }: SidebarFooterProps) {
    const isDark = useIsDark()
    const [moreMenuOpen, setMoreMenuOpen] = useState(false)
    const iconBtnStyle = {
        width: 28, height: 28, borderRadius: 7, border: 'none',
        background: 'transparent', cursor: 'pointer', fontSize: 14,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    } as const
    const iconHoverBg = T.bgHoverSoft

    return (
        <div style={{ borderTop: '1px solid var(--border-light)', flexShrink: 0, paddingBottom: 2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-around', padding: '4px 12px' }}>
                {([
                    { icon: '🔍', title: '篩選卡片', fn: () => onOpenPanel('filter') },
                    { icon: '🔒', title: '自動備份', fn: () => onOpenPanel('backup') },
                    { icon: '⌨️', title: '快捷鍵', fn: () => onOpenPanel('hotkey') },
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
                            <div style={{ position: 'fixed', inset: 0, zIndex: Z_CLICK_AWAY }} onClick={() => setMoreMenuOpen(false)} />
                            <div style={{
                                position: 'absolute', bottom: 34, right: 0,
                                background: T.bgPanel,
                                border: `1px solid ${T.borderLight}`,
                                borderRadius: 10, padding: '4px 0',
                                boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                                zIndex: Z_MODAL_BACKDROP, minWidth: 160,
                            }}>
                                {([
                                    { icon: '⌘', label: '命令面板 (Ctrl+K)', panel: 'commandPalette' as const },
                                    { icon: '🛡️', label: '資料安全中心', panel: 'dataSafety' as const },
                                    { icon: '☁️', label: '雲端同步', panel: 'cloudSync' as const },
                                    { icon: '📖', label: '使用導覽', panel: 'onboarding' as const },
                                ]).map(({ icon, label, panel }) => (
                                    <div
                                        key={panel}
                                        onClick={() => { setMoreMenuOpen(false); onOpenPanel(panel) }}
                                        style={{
                                            padding: '7px 14px', cursor: 'pointer',
                                            fontSize: 13, color: 'var(--text-primary)',
                                            display: 'flex', alignItems: 'center', gap: 8,
                                            borderRadius: 6,
                                        }}
                                        onMouseEnter={e => (e.currentTarget.style.background = T.bgHoverSoft)}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                    >
                                        {icon} {label}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
