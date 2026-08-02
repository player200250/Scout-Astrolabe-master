// src/CommandPalette.tsx
// 全域 Command Palette（N1，Ctrl+K）。命令清單來自 utils/commands，
// 白板切換作為額外一組結果併入，統一為可搜尋的單一入口。
import { useEffect, useRef, useState, useMemo } from 'react'
import type { BoardRecord } from './db'
import type { Command } from './utils/commands'
import { filterCommands } from './utils/commands'
import { Z_MODAL_BACKDROP, Z_MODAL, MODAL_TOP, MODAL_WIDTH, MODAL_BACKDROP } from './constants'
import { T } from './theme/tokens'
import { Icon } from './components/ui/icons'
import type { IconName } from './components/ui/icons'

interface CommandPaletteProps {
    commands: Command[]
    boards: BoardRecord[]
    activeBoardId: string
    onSwitchBoard: (id: string) => void
    onClose: () => void
}

/** 統一的可執行項（命令或白板切換）。 */
interface PaletteItem {
    id: string
    title: string
    icon: IconName
    group: string
    keywords?: string
    shortcut?: string
    thumbnail?: string | null
    run: () => void
}

const RECENT_BOARDS_WHEN_EMPTY = 5

// 分組顯示順序由 buildCommands 的清單順序保證（命令群組連續在前），
// boardItems 併在最後 → filterCommands 保序，渲染時遇新 group 即插 header。

function boardIcon(b: BoardRecord): IconName {
    return b.isHome ? 'home' : b.isInbox ? 'inbox' : b.isJournal ? 'cardJournal' : 'cardBoard'
}

export function CommandPalette({ commands, boards, activeBoardId, onSwitchBoard, onClose }: CommandPaletteProps) {
    const [query, setQuery] = useState('')
    const [selectedIdx, setSelectedIdx] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)
    const itemRefs = useRef<(HTMLDivElement | null)[]>([])

    const commandItems = useMemo<PaletteItem[]>(() => commands.map(c => ({
        id: c.id, title: c.title, icon: c.icon, group: c.group, keywords: c.keywords, shortcut: c.shortcut, run: c.run,
    })), [commands])

    const boardItems = useMemo<PaletteItem[]>(() => {
        const active = boards
            .filter(b => !b.deletedAt && b.status !== 'archived')
            .sort((a, b) => (b.lastVisitedAt ?? b.updatedAt ?? 0) - (a.lastVisitedAt ?? a.updatedAt ?? 0))
        return active.map(b => ({
            id: `board:${b.id}`,
            title: b.name,
            icon: boardIcon(b),
            group: '前往白板',
            keywords: 'board 白板 切換',
            thumbnail: b.thumbnail,
            run: () => onSwitchBoard(b.id),
        }))
    }, [boards, onSwitchBoard])

    // 空 query 時只顯示最近幾個白板，避免長列表；輸入後才展開全部白板可搜。
    const filtered = useMemo(() => {
        const pool = query.trim()
            ? [...commandItems, ...boardItems]
            : [...commandItems, ...boardItems.slice(0, RECENT_BOARDS_WHEN_EMPTY)]
        return filterCommands(pool, query)
    }, [query, commandItems, boardItems])

    useEffect(() => { setSelectedIdx(0) }, [filtered])
    useEffect(() => { inputRef.current?.focus() }, [])
    useEffect(() => { itemRefs.current[selectedIdx]?.scrollIntoView({ block: 'nearest' }) }, [selectedIdx])

    const runItem = (item: PaletteItem | undefined) => {
        if (!item) return
        onClose()
        item.run()
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const len = filtered.length
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setSelectedIdx(prev => (prev + 1) % Math.max(len, 1))
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setSelectedIdx(prev => (prev - 1 + Math.max(len, 1)) % Math.max(len, 1))
        } else if (e.key === 'Enter') {
            e.preventDefault()
            runItem(filtered[selectedIdx])
        } else if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
        }
    }

    const bg     = T.bgPanel
    const text   = T.textPrimary
    const muted   = T.textMuted
    const border  = T.borderLight
    const selBg   = T.accentBg
    const kbdBg    = T.bgApp

    let lastGroup = ''

    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: MODAL_BACKDROP, zIndex: Z_MODAL_BACKDROP }} />

            <div style={{
                position: 'fixed', top: MODAL_TOP, left: '50%', transform: 'translateX(-50%)',
                width: MODAL_WIDTH, maxWidth: '92vw',
                background: bg, borderRadius: 14, overflow: 'hidden',
                boxShadow: `${T.shadowModal}, 0 0 0 1px ${T.ringSubtle}`,
                zIndex: Z_MODAL,
            }}>
                {/* Search row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${border}` }}>
                    <span style={{ fontSize: 15, color: muted, flexShrink: 0 }}>⌘</span>
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="輸入命令或白板名稱…"
                        style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, color: text, fontFamily: 'inherit' }}
                    />
                    {query && (
                        <button
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => { setQuery(''); inputRef.current?.focus() }}
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, color: muted, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
                        >×</button>
                    )}
                </div>

                {/* Results */}
                <div style={{ maxHeight: 380, overflowY: 'auto', padding: '4px 0' }}>
                    {filtered.length === 0 ? (
                        <div style={{ padding: '20px 16px', textAlign: 'center', color: muted, fontSize: 13 }}>找不到符合的命令或白板</div>
                    ) : filtered.map((item, idx) => {
                        const isSel = idx === selectedIdx
                        const showHeader = item.group !== lastGroup
                        lastGroup = item.group
                        const isActiveBoard = item.id === `board:${activeBoardId}`
                        return (
                            <div key={item.id}>
                                {showHeader && (
                                    <div style={{ padding: '8px 16px 3px', fontSize: 11, color: muted, fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase' }}>
                                        {item.group}
                                    </div>
                                )}
                                <div
                                    ref={el => { itemRefs.current[idx] = el }}
                                    onMouseDown={e => e.preventDefault()}
                                    onClick={() => runItem(item)}
                                    onMouseEnter={() => setSelectedIdx(idx)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '7px 14px', cursor: 'pointer',
                                        background: isSel ? selBg : 'transparent',
                                        borderLeft: `3px solid ${isSel ? '#3b82f6' : 'transparent'}`,
                                    }}
                                >
                                    <span style={{ width: 20, flexShrink: 0, display: 'flex', justifyContent: 'center', color: isSel ? text : muted }}>
                                        <Icon name={item.icon} />
                                    </span>
                                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: text, fontWeight: isActiveBoard ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {item.title}
                                    </span>
                                    {isActiveBoard && (
                                        <span style={{ fontSize: 10, flexShrink: 0, color: '#3b82f6', background: T.accentBgStrong, borderRadius: 4, padding: '1px 5px' }}>目前</span>
                                    )}
                                    {item.shortcut && (
                                        <span style={{ fontSize: 11, color: muted, background: kbdBg, borderRadius: 4, padding: '2px 6px', flexShrink: 0 }}>{item.shortcut}</span>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* Keyboard hints */}
                <div style={{ padding: '7px 16px', borderTop: `1px solid ${border}`, display: 'flex', gap: 14, fontSize: 11, color: muted }}>
                    <span>↑↓ 選擇</span>
                    <span>↵ 執行</span>
                    <span>Esc 關閉</span>
                </div>
            </div>
        </>
    )
}
