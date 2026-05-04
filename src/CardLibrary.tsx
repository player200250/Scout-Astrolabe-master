// src/CardLibrary.tsx
import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { BoardRecord } from './db'
import { getCardShapes } from './utils/snapshot'

/* ─── Types ─── */
type LibCardType = 'text' | 'todo' | 'link' | 'journal'
type StatusType  = 'none' | 'todo' | 'in-progress' | 'done'
type PriorityType = 'none' | 'low' | 'medium' | 'high'
type SortKey = 'updatedAt-desc' | 'updatedAt-asc' | 'boardName' | 'type'
type ViewMode = 'list' | 'grid'

interface LibraryCard {
    shapeId: string
    boardId: string
    boardName: string
    type: LibCardType
    preview: string
    tags: string[]
    status: StatusType
    priority: PriorityType
    boardUpdatedAt: number
    x: number
    y: number
}

export interface CardLibraryProps {
    boards: BoardRecord[]
    onJump: (boardId: string, shapeId: string, x: number, y: number) => void
    onClose: () => void
    isDark: boolean
}

/* ─── Constants ─── */
const TYPE_ICON: Record<LibCardType, string>  = { text: '📝', todo: '✅', link: '🔗', journal: '📖' }
const TYPE_LABEL: Record<LibCardType, string> = { text: '文字', todo: 'Todo', link: '連結', journal: 'Journal' }

const ALL_TYPES: LibCardType[]    = ['text', 'todo', 'link', 'journal']
const ALL_STATUSES: StatusType[]  = ['none', 'todo', 'in-progress', 'done']
const ALL_PRIORITIES: PriorityType[] = ['none', 'low', 'medium', 'high']

const STATUS_CONFIG: Record<StatusType, { label: string; color: string; bg: string; darkBg: string }> = {
    none:          { label: '無',    color: '#6b7280', bg: '#f3f4f6', darkBg: '#374151' },
    todo:          { label: '待辦',  color: '#374151', bg: '#f0f0f0', darkBg: '#2d3748' },
    'in-progress': { label: '進行中', color: '#1d4ed8', bg: '#dbeafe', darkBg: '#1e3a5f' },
    done:          { label: '完成',  color: '#15803d', bg: '#dcfce7', darkBg: '#14532d' },
}

const PRIORITY_CONFIG: Record<PriorityType, { label: string; color: string }> = {
    none:   { label: '無', color: '#9ca3af' },
    low:    { label: '低', color: '#ca8a04' },
    medium: { label: '中', color: '#ea580c' },
    high:   { label: '高', color: '#dc2626' },
}

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: 'updatedAt-desc', label: '最近更新' },
    { key: 'updatedAt-asc',  label: '最早建立' },
    { key: 'boardName',      label: '白板名稱' },
    { key: 'type',           label: '卡片類型' },
]

/* ─── Helpers ─── */
function stripHtml(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

function timeAgo(ts: number): string {
    const diff = Date.now() - ts
    const d = Math.floor(diff / 86400000)
    const h = Math.floor(diff / 3600000)
    const m = Math.floor(diff / 60000)
    if (d > 30) return `${Math.floor(d / 30)} 個月前`
    if (d > 0)  return `${d} 天前`
    if (h > 0)  return `${h} 小時前`
    if (m > 0)  return `${m} 分鐘前`
    return '剛剛'
}

function parseStatus(v: unknown): StatusType {
    return (ALL_STATUSES as string[]).includes(v as string) ? (v as StatusType) : 'none'
}
function parsePriority(v: unknown): PriorityType {
    return (ALL_PRIORITIES as string[]).includes(v as string) ? (v as PriorityType) : 'none'
}

/* ─── Component ─── */
export function CardLibrary({ boards, onJump, onClose, isDark }: CardLibraryProps) {
    const [search, setSearch]           = useState('')
    const [sortKey, setSortKey]         = useState<SortKey>('updatedAt-desc')
    const [viewMode, setViewMode]       = useState<ViewMode>('list')
    const [filterType, setFilterType]   = useState<LibCardType | 'all'>('all')
    const [filterBoard, setFilterBoard] = useState<string>('all')
    const [filterStatus, setFilterStatus]     = useState<StatusType | 'all'>('all')
    const [filterPriority, setFilterPriority] = useState<PriorityType | 'all'>('all')
    const [filterTag, setFilterTag]     = useState<string | null>(null)

    const scrollRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', h)
        return () => window.removeEventListener('keydown', h)
    }, [onClose])

    /* ── Build card list ── */
    const allCards = useMemo<LibraryCard[]>(() => {
        const cards: LibraryCard[] = []
        for (const board of boards) {
            for (const shape of getCardShapes(board.snapshot)) {
                const t = shape.props.type
                if (t !== 'text' && t !== 'todo' && t !== 'link' && t !== 'journal') continue
                const raw = shape.props.text ?? ''
                cards.push({
                    shapeId: shape.id,
                    boardId: board.id,
                    boardName: board.name,
                    type: t as LibCardType,
                    preview: stripHtml(raw).slice(0, 200),
                    tags: Array.isArray(shape.props.tags) ? (shape.props.tags as string[]) : [],
                    status: parseStatus(shape.props.cardStatus),
                    priority: parsePriority(shape.props.priority),
                    boardUpdatedAt: board.updatedAt,
                    x: shape.x,
                    y: shape.y,
                })
            }
        }
        return cards
    }, [boards])

    const allTags = useMemo<string[]>(() => {
        const s = new Set<string>()
        allCards.forEach(c => c.tags.forEach(t => s.add(t)))
        return [...s].sort()
    }, [allCards])

    /* ── Filter + sort ── */
    const filteredCards = useMemo<LibraryCard[]>(() => {
        const q = search.trim().toLowerCase()
        let cards = allCards
        if (q) cards = cards.filter(c =>
            c.preview.toLowerCase().includes(q) ||
            c.boardName.toLowerCase().includes(q) ||
            c.tags.some(t => t.toLowerCase().includes(q))
        )
        if (filterType !== 'all')     cards = cards.filter(c => c.type === filterType)
        if (filterBoard !== 'all')    cards = cards.filter(c => c.boardId === filterBoard)
        if (filterStatus !== 'all')   cards = cards.filter(c => c.status === filterStatus)
        if (filterPriority !== 'all') cards = cards.filter(c => c.priority === filterPriority)
        if (filterTag !== null)       cards = cards.filter(c => c.tags.includes(filterTag!))

        return [...cards].sort((a, b) => {
            if (sortKey === 'updatedAt-desc') return b.boardUpdatedAt - a.boardUpdatedAt
            if (sortKey === 'updatedAt-asc')  return a.boardUpdatedAt - b.boardUpdatedAt
            if (sortKey === 'boardName') return a.boardName.localeCompare(b.boardName)
            if (sortKey === 'type') return a.type.localeCompare(b.type)
            return 0
        })
    }, [allCards, search, filterType, filterBoard, filterStatus, filterPriority, filterTag, sortKey])

    /* ── Reset scroll on filter/view change ── */
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: 0 })
    }, [viewMode, filterType, filterBoard, filterStatus, filterPriority, filterTag, sortKey, search])

    /* ── Virtual scroll ── */
    const COLS = 3
    const virtCount = viewMode === 'list'
        ? filteredCards.length
        : Math.ceil(filteredCards.length / COLS)
    const estimateSize = useCallback(
        () => (viewMode === 'list' ? 120 : 220),
        [viewMode]
    )
    const virtualizer = useVirtualizer({
        count: virtCount,
        getScrollElement: () => scrollRef.current,
        estimateSize,
        overscan: 6,
    })

    /* ── Theme tokens ── */
    const bg         = isDark ? '#0f172a' : '#f1f5f9'
    const sidebarBg  = isDark ? '#1e293b' : '#ffffff'
    const mainBg     = isDark ? '#0f172a' : '#f1f5f9'
    const border     = isDark ? '#334155' : '#e2e8f0'
    const textPrim   = isDark ? '#e2e8f0' : '#1e293b'
    const textMuted  = isDark ? '#94a3b8' : '#64748b'
    const cardBg     = isDark ? '#1e293b' : '#ffffff'
    const cardHover  = isDark ? '#263149' : '#f8fafc'
    const inputBg    = isDark ? '#0f172a' : '#f8fafc'
    const pillActive = isDark ? 'rgba(59,130,246,0.25)' : '#dbeafe'
    const pillActColor = '#2563eb'
    const pillInact  = isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9'
    const pillInactColor = textMuted

    /* ─── Sidebar filter section helper ─── */
    const sectionTitle = (label: string) => (
        <div style={{ fontSize: 10, fontWeight: 700, color: isDark ? '#475569' : '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
    )
    const hoverBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'
    const pill = (label: string, active: boolean, onClick: () => void) => (
        <button
            key={label}
            onClick={onClick}
            style={{
                height: 32, padding: '0 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
                background: active ? pillActive : 'transparent',
                color: active ? pillActColor : pillInactColor,
                fontSize: 12, fontWeight: active ? 600 : 400,
                width: '100%', textAlign: 'left',
                display: 'flex', alignItems: 'center',
                transition: 'background 0.12s',
                flexShrink: 0,
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = hoverBg }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
        >{label}</button>
    )

    /* ─── Card item renderers ─── */
    const handleJump = (card: LibraryCard) => {
        onJump(card.boardId, card.shapeId, card.x, card.y)
        onClose()
    }

    const renderListCard = (card: LibraryCard) => {
        const statusCfg  = STATUS_CONFIG[card.status]
        const priorityCfg = PRIORITY_CONFIG[card.priority]
        return (
            <div
                onClick={() => handleJump(card)}
                style={{
                    display: 'flex', alignItems: 'flex-start', gap: 14,
                    padding: '14px 18px', cursor: 'pointer', borderRadius: 10,
                    background: cardBg, border: `1px solid ${border}`,
                    height: '100%', boxSizing: 'border-box',
                    transition: 'background 0.12s, border-color 0.12s',
                }}
                onMouseEnter={e => {
                    e.currentTarget.style.background = cardHover
                    e.currentTarget.style.borderColor = isDark ? '#475569' : '#cbd5e1'
                }}
                onMouseLeave={e => {
                    e.currentTarget.style.background = cardBg
                    e.currentTarget.style.borderColor = border
                }}
            >
                {/* Type icon pill */}
                <div style={{
                    width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                    background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, marginTop: 1,
                }}>
                    {TYPE_ICON[card.type]}
                </div>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {/* Preview text */}
                    <div style={{
                        fontSize: 13, color: textPrim, lineHeight: '1.55',
                        overflow: 'hidden',
                        display: '-webkit-box', WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical' as const,
                    }}>
                        {card.preview || <span style={{ color: textMuted, fontStyle: 'italic' }}>（空白卡片）</span>}
                    </div>
                    {/* Meta row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{
                            fontSize: 11, color: textMuted, flexShrink: 0,
                            background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                            padding: '1px 7px', borderRadius: 5,
                        }}>{card.boardName}</span>
                        {card.status !== 'none' && (
                            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 5, background: isDark ? statusCfg.darkBg : statusCfg.bg, color: statusCfg.color, fontWeight: 600 }}>
                                {statusCfg.label}
                            </span>
                        )}
                        {card.priority !== 'none' && (
                            <span style={{ fontSize: 10, color: priorityCfg.color, fontWeight: 700 }}>
                                {card.priority === 'low' ? '↓' : card.priority === 'medium' ? '→' : '↑'} {priorityCfg.label}
                            </span>
                        )}
                        {card.tags.slice(0, 3).map(tag => (
                            <span key={tag} style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: isDark ? '#334155' : '#f1f5f9', color: textMuted }}>
                                #{tag}
                            </span>
                        ))}
                        <span style={{ fontSize: 11, color: isDark ? '#475569' : '#94a3b8', marginLeft: 'auto', flexShrink: 0 }}>{timeAgo(card.boardUpdatedAt)}</span>
                    </div>
                </div>
            </div>
        )
    }

    const renderGridCard = (card: LibraryCard) => {
        const statusCfg = STATUS_CONFIG[card.status]
        return (
            <div
                onClick={() => handleJump(card)}
                style={{
                    background: cardBg, borderRadius: 10, border: `1px solid ${border}`,
                    padding: '14px 16px', cursor: 'pointer', flex: 1, minWidth: 0,
                    display: 'flex', flexDirection: 'column', gap: 8,
                    transition: 'background 0.12s, border-color 0.12s',
                }}
                onMouseEnter={e => {
                    e.currentTarget.style.background = cardHover
                    e.currentTarget.style.borderColor = isDark ? '#475569' : '#cbd5e1'
                }}
                onMouseLeave={e => {
                    e.currentTarget.style.background = cardBg
                    e.currentTarget.style.borderColor = border
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontSize: 16 }}>{TYPE_ICON[card.type]}</span>
                    <span style={{ fontSize: 11, color: textMuted, fontWeight: 600 }}>{TYPE_LABEL[card.type]}</span>
                    {card.status !== 'none' && (
                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 5, background: isDark ? statusCfg.darkBg : statusCfg.bg, color: statusCfg.color, marginLeft: 'auto', fontWeight: 600 }}>
                            {statusCfg.label}
                        </span>
                    )}
                </div>
                <div style={{ fontSize: 12, color: textPrim, lineHeight: '1.6', overflow: 'hidden', flex: 1,
                    display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical' as const,
                }}>
                    {card.preview || <span style={{ color: textMuted, fontStyle: 'italic' }}>（空白）</span>}
                </div>
                {card.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {card.tags.slice(0, 4).map(tag => (
                            <span key={tag} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: isDark ? '#334155' : '#f1f5f9', color: textMuted }}>#{tag}</span>
                        ))}
                    </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${border}`, paddingTop: 8 }}>
                    <span style={{ fontSize: 11, color: textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>{card.boardName}</span>
                    <span style={{ fontSize: 10, color: isDark ? '#475569' : '#94a3b8', flexShrink: 0 }}>{timeAgo(card.boardUpdatedAt)}</span>
                </div>
            </div>
        )
    }

    /* ─── Sidebar boards list ─── */
    const nonSystemBoards = useMemo(
        () => boards.filter(b => !b.isInbox && !b.isJournal),
        [boards]
    )

    /* ─── Render ─── */
    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 20000,
            background: bg, display: 'flex', flexDirection: 'column',
            fontFamily: 'system-ui, -apple-system, sans-serif',
        }}>
            {/* ── Header ── */}
            <div style={{
                height: 54, flexShrink: 0,
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '0 20px',
                background: sidebarBg,
                borderBottom: `1px solid ${border}`,
                boxShadow: isDark ? '0 1px 0 rgba(0,0,0,0.3)' : '0 1px 0 rgba(0,0,0,0.06)',
            }}>
                {/* Title */}
                <span style={{ fontSize: 16, fontWeight: 700, color: textPrim, flexShrink: 0, userSelect: 'none' }}>
                    🗂️ 卡片庫
                </span>
                <span style={{ fontSize: 12, color: textMuted, flexShrink: 0 }}>
                    {filteredCards.length} / {allCards.length}
                </span>

                {/* Search */}
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="搜尋卡片內容、白板、標籤…"
                    autoFocus
                    style={{
                        flex: 1, height: 34, borderRadius: 8,
                        border: `1px solid ${border}`,
                        background: inputBg, color: textPrim,
                        padding: '0 12px', fontSize: 13,
                        outline: 'none',
                        minWidth: 0,
                    }}
                />

                {/* Sort */}
                <select
                    value={sortKey}
                    onChange={e => setSortKey(e.target.value as SortKey)}
                    style={{
                        height: 34, borderRadius: 8, border: `1px solid ${border}`,
                        background: inputBg, color: textPrim,
                        padding: '0 8px', fontSize: 12, cursor: 'pointer', flexShrink: 0,
                    }}
                >
                    {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>

                {/* View toggle */}
                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                    {(['list', 'grid'] as ViewMode[]).map(mode => (
                        <button
                            key={mode}
                            onClick={() => setViewMode(mode)}
                            title={mode === 'list' ? '列表視圖' : '格狀視圖'}
                            style={{
                                width: 32, height: 32, borderRadius: 7, border: 'none',
                                background: viewMode === mode ? pillActive : 'transparent',
                                color: viewMode === mode ? pillActColor : textMuted,
                                cursor: 'pointer', fontSize: 15,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >{mode === 'list' ? '☰' : '⊞'}</button>
                    ))}
                </div>

                {/* Close */}
                <button
                    onClick={onClose}
                    style={{
                        width: 32, height: 32, borderRadius: 8, border: 'none',
                        background: 'transparent', cursor: 'pointer', fontSize: 18,
                        color: textMuted, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >✕</button>
            </div>

            {/* ── Body ── */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                {/* Left sidebar */}
                <div style={{
                    width: 220, flexShrink: 0, overflowY: 'auto',
                    background: sidebarBg,
                    borderRight: `1px solid ${border}`,
                    padding: '16px 10px',
                }}>
                    {/* Type */}
                    <div style={{ marginBottom: 18 }}>
                        {sectionTitle('卡片類型')}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {pill('全部', filterType === 'all', () => setFilterType('all'))}
                            {ALL_TYPES.map(t => pill(
                                `${TYPE_ICON[t]} ${TYPE_LABEL[t]}`,
                                filterType === t,
                                () => setFilterType(filterType === t ? 'all' : t)
                            ))}
                        </div>
                    </div>

                    {/* Board */}
                    <div style={{ marginBottom: 18 }}>
                        {sectionTitle('白板')}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {pill('全部', filterBoard === 'all', () => setFilterBoard('all'))}
                            {nonSystemBoards.map(b => {
                                const isActive = filterBoard === b.id
                                return (
                                    <button
                                        key={b.id}
                                        onClick={() => setFilterBoard(isActive ? 'all' : b.id)}
                                        style={{
                                            height: 32, padding: '0 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
                                            background: isActive ? pillActive : 'transparent',
                                            color: isActive ? pillActColor : pillInactColor,
                                            fontSize: 12, fontWeight: isActive ? 600 : 400,
                                            width: '100%', textAlign: 'left',
                                            display: 'flex', alignItems: 'center', gap: 8,
                                            transition: 'background 0.12s',
                                            flexShrink: 0,
                                        }}
                                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = hoverBg }}
                                        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                                    >
                                        <span style={{
                                            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                                            background: isActive ? pillActColor : (isDark ? '#475569' : '#cbd5e1'),
                                            transition: 'background 0.12s',
                                        }} />
                                        <span style={{
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                                        }}>{b.name}</span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* Status */}
                    <div style={{ marginBottom: 18 }}>
                        {sectionTitle('狀態')}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {pill('全部', filterStatus === 'all', () => setFilterStatus('all'))}
                            {ALL_STATUSES.map(s => pill(
                                STATUS_CONFIG[s].label,
                                filterStatus === s,
                                () => setFilterStatus(filterStatus === s ? 'all' : s)
                            ))}
                        </div>
                    </div>

                    {/* Priority */}
                    <div style={{ marginBottom: 18 }}>
                        {sectionTitle('優先度')}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {pill('全部', filterPriority === 'all', () => setFilterPriority('all'))}
                            {ALL_PRIORITIES.map(p => pill(
                                PRIORITY_CONFIG[p].label,
                                filterPriority === p,
                                () => setFilterPriority(filterPriority === p ? 'all' : p)
                            ))}
                        </div>
                    </div>

                    {/* Tags */}
                    {allTags.length > 0 && (
                        <div>
                            {sectionTitle('標籤')}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {pill('全部', filterTag === null, () => setFilterTag(null))}
                                {allTags.map(tag => pill(
                                    `#${tag}`,
                                    filterTag === tag,
                                    () => setFilterTag(filterTag === tag ? null : tag)
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Main card area */}
                <div
                    ref={scrollRef}
                    style={{ flex: 1, overflowY: 'auto', background: mainBg, padding: '14px 16px' }}
                >
                    {filteredCards.length === 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
                            <span style={{ fontSize: 40 }}>🗃️</span>
                            <span style={{ fontSize: 14, color: textMuted }}>{allCards.length === 0 ? '尚無卡片' : '沒有符合條件的卡片'}</span>
                        </div>
                    ) : (
                        <div style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
                            {virtualizer.getVirtualItems().map(vItem => {
                                if (viewMode === 'list') {
                                    const card = filteredCards[vItem.index]
                                    if (!card) return null
                                    return (
                                        <div
                                            key={card.shapeId}
                                            style={{
                                                position: 'absolute', top: 0, left: 0, width: '100%',
                                                height: vItem.size,
                                                transform: `translateY(${vItem.start}px)`,
                                                paddingBottom: 8,
                                                boxSizing: 'border-box',
                                            }}
                                        >
                                            {renderListCard(card)}
                                        </div>
                                    )
                                } else {
                                    // Grid row: 3 cards per row
                                    const startIdx = vItem.index * COLS
                                    const rowCards = filteredCards.slice(startIdx, startIdx + COLS)
                                    return (
                                        <div
                                            key={vItem.index}
                                            style={{
                                                position: 'absolute', top: 0, left: 0, width: '100%',
                                                height: vItem.size,
                                                transform: `translateY(${vItem.start}px)`,
                                                display: 'flex', gap: 12, alignItems: 'stretch',
                                                paddingBottom: 12, boxSizing: 'border-box',
                                            }}
                                        >
                                            {rowCards.map(card => renderGridCard(card))}
                                            {/* Fill empty slots so last row aligns */}
                                            {Array.from({ length: COLS - rowCards.length }).map((_, i) => (
                                                <div key={`empty-${i}`} style={{ flex: 1 }} />
                                            ))}
                                        </div>
                                    )
                                }
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
