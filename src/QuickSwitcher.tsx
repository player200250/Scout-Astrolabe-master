// src/QuickSwitcher.tsx
import { useEffect, useRef, useState, useMemo } from 'react'
import type { BoardRecord } from './db'
import { Z_MODAL_BACKDROP, Z_MODAL } from './constants'

interface QuickSwitcherProps {
    boards: BoardRecord[]
    activeBoardId: string
    onSwitch: (id: string) => void
    onClose: () => void
    isDark: boolean
}

function relativeTime(ts: number): string {
    const diff = Date.now() - ts
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return '剛剛'
    if (mins < 60) return `${mins} 分鐘前`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours} 小時前`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days} 天前`
    const months = Math.floor(days / 30)
    if (months < 12) return `${months} 個月前`
    return `${Math.floor(months / 12)} 年前`
}

export function QuickSwitcher({ boards, activeBoardId, onSwitch, onClose, isDark }: QuickSwitcherProps) {
    const [query, setQuery] = useState('')
    const [selectedIdx, setSelectedIdx] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)
    const itemRefs = useRef<(HTMLDivElement | null)[]>([])

    const results = useMemo(() => {
        const active = boards.filter(b => !b.deletedAt && b.status !== 'archived')
        if (query.trim() === '') {
            return [...active]
                .sort((a, b) => (b.lastVisitedAt ?? b.updatedAt ?? 0) - (a.lastVisitedAt ?? a.updatedAt ?? 0))
                .slice(0, 8)
        }
        const q = query.toLowerCase()
        return active.filter(b => b.name.toLowerCase().includes(q)).slice(0, 8)
    }, [boards, query])

    useEffect(() => { setSelectedIdx(0) }, [results])

    useEffect(() => { inputRef.current?.focus() }, [])

    useEffect(() => {
        itemRefs.current[selectedIdx]?.scrollIntoView({ block: 'nearest' })
    }, [selectedIdx])

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const len = results.length
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setSelectedIdx(prev => (prev + 1) % Math.max(len, 1))
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setSelectedIdx(prev => (prev - 1 + Math.max(len, 1)) % Math.max(len, 1))
        } else if (e.key === 'Enter') {
            e.preventDefault()
            const board = results[selectedIdx]
            if (board) { onSwitch(board.id); onClose() }
        } else if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
        }
    }

    const bg      = isDark ? '#1e293b' : '#fff'
    const text    = isDark ? '#e2e8f0' : '#1a1a1a'
    const muted   = isDark ? '#64748b' : '#9ca3af'
    const border  = isDark ? '#334155' : '#e5e7eb'
    const thumbBg = isDark ? '#334155' : '#f1f5f9'
    const thumbBorder = isDark ? '#475569' : '#e2e8f0'
    const selBg   = isDark ? 'rgba(59,130,246,0.15)' : '#eff6ff'

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: Z_MODAL_BACKDROP }}
            />

            {/* Modal */}
            <div style={{
                position: 'fixed', top: '18%', left: '50%', transform: 'translateX(-50%)',
                width: 480, maxWidth: '92vw',
                background: bg, borderRadius: 14, overflow: 'hidden',
                boxShadow: isDark
                    ? '0 16px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.07)'
                    : '0 16px 64px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)',
                zIndex: Z_MODAL,
            }}>
                {/* Search row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${border}` }}>
                    <span style={{ fontSize: 16, color: muted, flexShrink: 0 }}>🔍</span>
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="輸入白板名稱..."
                        style={{
                            flex: 1, border: 'none', outline: 'none',
                            background: 'transparent', fontSize: 15,
                            color: text, fontFamily: 'inherit',
                        }}
                    />
                    {query && (
                        <button
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => { setQuery(''); inputRef.current?.focus() }}
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, color: muted, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
                        >×</button>
                    )}
                </div>

                {/* Section label */}
                <div style={{ padding: '6px 16px 2px', fontSize: 11, color: muted, fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase' as const }}>
                    {query.trim() ? `搜尋結果（${results.length}）` : '最近使用'}
                </div>

                {/* Results */}
                <div style={{ maxHeight: 336, overflowY: 'auto' }}>
                    {results.length === 0 ? (
                        <div style={{ padding: '20px 16px', textAlign: 'center' as const, color: muted, fontSize: 13 }}>
                            找不到符合的白板
                        </div>
                    ) : results.map((board, idx) => {
                        const ts = board.lastVisitedAt ?? board.updatedAt ?? 0
                        const isSel = idx === selectedIdx
                        const isActive = board.id === activeBoardId

                        return (
                            <div
                                key={board.id}
                                ref={el => { itemRefs.current[idx] = el }}
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => { onSwitch(board.id); onClose() }}
                                onMouseEnter={() => setSelectedIdx(idx)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '7px 14px', cursor: 'pointer',
                                    background: isSel ? selBg : 'transparent',
                                    borderLeft: `3px solid ${isSel ? '#3b82f6' : 'transparent'}`,
                                }}
                            >
                                {/* Thumbnail */}
                                <div style={{
                                    width: 42, height: 30, borderRadius: 5, flexShrink: 0,
                                    overflow: 'hidden', background: thumbBg,
                                    border: `1px solid ${thumbBorder}`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    {board.thumbnail ? (
                                        <img src={board.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <span style={{ fontSize: 14, opacity: 0.4 }}>
                                            {board.isHome ? '🏠' : board.isInbox ? '📥' : board.isJournal ? '📔' : '📋'}
                                        </span>
                                    )}
                                </div>

                                {/* Name + badges */}
                                <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
                                    <span style={{
                                        fontSize: 13, fontWeight: isActive ? 600 : 400, color: text,
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    }}>{board.name}</span>
                                    {isActive && (
                                        <span style={{
                                            fontSize: 10, flexShrink: 0, color: '#3b82f6',
                                            background: isDark ? 'rgba(59,130,246,0.2)' : '#dbeafe',
                                            borderRadius: 4, padding: '1px 5px',
                                        }}>目前</span>
                                    )}
                                    {board.status === 'pinned' && (
                                        <span style={{ fontSize: 11, flexShrink: 0, opacity: 0.65 }}>📌</span>
                                    )}
                                    {board.isInbox && (
                                        <span style={{ fontSize: 11, flexShrink: 0, opacity: 0.65 }}>📥</span>
                                    )}
                                    {board.isJournal && (
                                        <span style={{ fontSize: 11, flexShrink: 0, opacity: 0.65 }}>📔</span>
                                    )}
                                </div>

                                {/* Relative time */}
                                <span style={{ fontSize: 11, color: muted, flexShrink: 0 }}>
                                    {relativeTime(ts)}
                                </span>
                            </div>
                        )
                    })}
                </div>

                {/* Keyboard hints */}
                <div style={{
                    padding: '7px 16px', borderTop: `1px solid ${border}`,
                    display: 'flex', gap: 14, fontSize: 11, color: muted,
                }}>
                    <span>↑↓ 選擇</span>
                    <span>↵ 切換</span>
                    <span>Esc 關閉</span>
                </div>
            </div>
        </>
    )
}
