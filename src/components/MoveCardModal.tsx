import { useEffect } from 'react'
import type { BoardRecord } from '../db'
import { isRasterThumbnail } from '../utils/boardDb'

interface MoveCardModalProps {
    boards: BoardRecord[]
    onSelect: (targetBoardId: string) => void
    onClose: () => void
    isDark: boolean
}

export function MoveCardModal({ boards, onSelect, onClose, isDark }: MoveCardModalProps) {
    const targets = boards.filter(b => !b.isHome && !b.isInbox && b.status !== 'archived')

    const bg = isDark ? '#1e293b' : 'white'
    const textColor = isDark ? '#e2e8f0' : '#1a1a1a'
    const borderColor = isDark ? '#334155' : '#f0f0f0'
    const hoverBg = isDark ? '#2d3748' : '#f5f5f5'
    const thumbBg = isDark ? '#334155' : '#f0f0f0'
    const thumbBorder = isDark ? '#475569' : '#eee'
    const mutedColor = isDark ? '#64748b' : '#aaa'

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', h)
        return () => window.removeEventListener('keydown', h)
    }, [onClose])

    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 99998 }} />
            <div style={{
                position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                background: bg, borderRadius: 12, width: 300, maxHeight: '60vh',
                boxShadow: '0 12px 40px rgba(0,0,0,0.2)', zIndex: 99999,
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                border: `1px solid ${borderColor}`,
            }}>
                <div style={{ padding: '13px 16px', borderBottom: `1px solid ${borderColor}`, fontSize: 14, fontWeight: 600, color: textColor, flexShrink: 0 }}>
                    📦 移到白板
                </div>
                <div style={{ overflowY: 'auto', padding: '4px 0' }}>
                    {targets.length === 0 ? (
                        <div style={{ padding: '20px', fontSize: 13, color: mutedColor, textAlign: 'center' }}>尚無可移動的白板</div>
                    ) : targets.map(b => (
                        <div
                            key={b.id}
                            onClick={() => { onSelect(b.id); onClose() }}
                            style={{ padding: '9px 16px', fontSize: 13, cursor: 'pointer', color: textColor, display: 'flex', alignItems: 'center', gap: 8 }}
                            onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                            {isRasterThumbnail(b.thumbnail)
                                ? <img src={b.thumbnail} style={{ width: 24, height: 16, objectFit: 'cover', borderRadius: 3, flexShrink: 0, border: `1px solid ${thumbBorder}` }} alt="" />
                                : <div style={{ width: 24, height: 16, borderRadius: 3, background: thumbBg, border: `1px solid ${thumbBorder}`, flexShrink: 0 }} />
                            }
                            {b.name}
                        </div>
                    ))}
                </div>
                <div style={{ padding: '8px 16px', borderTop: `1px solid ${borderColor}`, flexShrink: 0 }}>
                    <button onClick={onClose} style={{ width: '100%', padding: '7px', borderRadius: 8, border: `1px solid ${borderColor}`, cursor: 'pointer', fontSize: 13, background: 'transparent', color: textColor }}>取消</button>
                </div>
            </div>
        </>
    )
}
