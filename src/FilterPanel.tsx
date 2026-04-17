// src/FilterPanel.tsx
import { useState, useMemo, useEffect } from 'react'
import type { TLEditorSnapshot } from 'tldraw'

type CardStatusType = 'none' | 'todo' | 'in-progress' | 'done'
type PriorityType   = 'none' | 'low'  | 'medium'      | 'high'

interface FilterResult {
    boardId: string
    boardName: string
    shapeId: string
    preview: string
    cardStatus: CardStatusType
    priority: PriorityType
    tags: string[]
    x: number
    y: number
}

interface BoardRecord {
    id: string
    name: string
    snapshot: TLEditorSnapshot | null
}

interface FilterPanelProps {
    boards: BoardRecord[]
    onJump: (boardId: string, shapeId: string, x: number, y: number) => void
    onClose: () => void
}

/* ----------------------------------------------------------------- 常數設定 */
const STATUS_CONFIG: Record<CardStatusType, { label: string; color: string; bg: string }> = {
    none:          { label: '無',    color: '#888',    bg: '#f5f5f5' },
    todo:          { label: '待辦',  color: '#555',    bg: '#f0f0f0' },
    'in-progress': { label: '進行中', color: '#2563eb', bg: '#dbeafe' },
    done:          { label: '完成',  color: '#16a34a', bg: '#dcfce7' },
}

const PRIORITY_CONFIG: Record<PriorityType, { label: string; color: string }> = {
    none:   { label: '無', color: '#bbb' },
    low:    { label: '低', color: '#ca8a04' },
    medium: { label: '中', color: '#ea580c' },
    high:   { label: '高', color: '#dc2626' },
}

/* ----------------------------------------------------------------- 工具函式 */
function stripHtml(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

function getAllTags(boards: BoardRecord[]): string[] {
    const tags = new Set<string>()
    for (const board of boards) {
        if (!board.snapshot) continue
        const store = (board.snapshot as any).document?.store ?? {}
        for (const shape of Object.values(store) as any[]) {
            if (shape.typeName !== 'shape' || shape.type !== 'card') continue
            for (const tag of (shape.props?.tags ?? []) as string[]) tags.add(tag)
        }
    }
    return [...tags].sort()
}

function scanCards(
    boards: BoardRecord[],
    filterStatuses: Set<CardStatusType>,
    filterPriorities: Set<PriorityType>,
    filterTag: string | null
): FilterResult[] {
    if (filterStatuses.size === 0 && filterPriorities.size === 0 && !filterTag) return []

    const results: FilterResult[] = []
    const seen = new Set<string>()

    for (const board of boards) {
        if (!board.snapshot) continue
        const store = (board.snapshot as any).document?.store ?? {}

        for (const shape of Object.values(store) as any[]) {
            if (shape.typeName !== 'shape' || shape.type !== 'card') continue
            const ptype: string = shape.props?.type
            if (ptype !== 'text' && ptype !== 'todo' && ptype !== 'journal') continue

            const key = `${board.id}_${shape.id}`
            if (seen.has(key)) continue
            seen.add(key)

            const status: CardStatusType  = shape.props.cardStatus ?? 'none'
            const priority: PriorityType  = shape.props.priority   ?? 'none'
            const tags: string[]          = shape.props.tags        ?? []

            const matchStatus   = filterStatuses.size   === 0 || filterStatuses.has(status)
            const matchPriority = filterPriorities.size === 0 || filterPriorities.has(priority)
            const matchTag      = !filterTag || tags.includes(filterTag)

            if (matchStatus && matchPriority && matchTag) {
                let preview = ''
                if (ptype === 'text' || ptype === 'journal') {
                    preview = stripHtml(shape.props.text || '').slice(0, 60)
                } else if (ptype === 'todo') {
                    preview = shape.props.text || shape.props.todos?.[0]?.text || ''
                }

                results.push({
                    boardId: board.id,
                    boardName: board.name,
                    shapeId: shape.id,
                    preview,
                    cardStatus: status,
                    priority,
                    tags,
                    x: shape.x ?? 0,
                    y: shape.y ?? 0,
                })
            }
        }
    }

    return results
}

/* ----------------------------------------------------------------- FilterResultRow */
interface FilterResultRowProps {
    result: FilterResult
    onJump: (boardId: string, shapeId: string, x: number, y: number) => void
}

function FilterResultRow({ result, onJump }: FilterResultRowProps) {
    const [hovered, setHovered] = useState(false)
    const sCfg = STATUS_CONFIG[result.cardStatus]
    const pCfg = PRIORITY_CONFIG[result.priority]

    return (
        <div
            onClick={() => onJump(result.boardId, result.shapeId, result.x, result.y)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                padding: '8px 16px', cursor: 'pointer',
                background: hovered ? '#f7f7f7' : 'transparent',
                borderBottom: '1px solid #f5f5f5',
                transition: 'background 0.1s',
            }}
        >
            {/* 狀態 + 優先度 + 白板名 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                {result.cardStatus !== 'none' && (
                    <span style={{
                        fontSize: 10, fontWeight: 600, color: sCfg.color,
                        background: sCfg.bg, borderRadius: 4, padding: '1px 5px', flexShrink: 0,
                    }}>
                        {sCfg.label}
                    </span>
                )}
                {result.priority !== 'none' && (
                    <span style={{ fontSize: 12, flexShrink: 0, color: pCfg.color, fontWeight: 700 }}>
                        {result.priority === 'low' ? '🟡' : result.priority === 'medium' ? '🟠' : '🔴'}
                    </span>
                )}
                <span style={{ fontSize: 11, color: '#bbb', marginLeft: 'auto', flexShrink: 0 }}>
                    {result.boardName}
                </span>
            </div>

            {/* 內容預覽 */}
            <div style={{
                fontSize: 12, color: '#1a1a1a',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                marginBottom: result.tags.length > 0 ? 4 : 0,
            }}>
                {result.preview || '(無內容)'}
            </div>

            {/* 標籤 */}
            {result.tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {result.tags.map(tag => (
                        <span key={tag} style={{
                            fontSize: 9, background: '#eff6ff', color: '#2563eb',
                            borderRadius: 6, padding: '1px 5px',
                        }}>
                            #{tag}
                        </span>
                    ))}
                </div>
            )}
        </div>
    )
}

/* ----------------------------------------------------------------- FilterPanel */
export function FilterPanel({ boards, onJump, onClose }: FilterPanelProps) {
    const [filterStatuses,   setFilterStatuses]   = useState<Set<CardStatusType>>(new Set())
    const [filterPriorities, setFilterPriorities] = useState<Set<PriorityType>>(new Set())
    const [filterTag,        setFilterTag]        = useState<string | null>(null)

    const allTags = useMemo(() => getAllTags(boards), [boards])
    const results = useMemo(
        () => scanCards(boards, filterStatuses, filterPriorities, filterTag),
        [boards, filterStatuses, filterPriorities, filterTag]
    )

    const hasFilter = filterStatuses.size > 0 || filterPriorities.size > 0 || filterTag !== null

    const toggleStatus = (s: CardStatusType) =>
        setFilterStatuses(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n })

    const togglePriority = (p: PriorityType) =>
        setFilterPriorities(prev => { const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n })

    const clearAll = () => {
        setFilterStatuses(new Set())
        setFilterPriorities(new Set())
        setFilterTag(null)
    }

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [onClose])

    const chipStyle = (active: boolean, color: string, bg: string): React.CSSProperties => ({
        fontSize: 11, borderRadius: 6, padding: '3px 8px', cursor: 'pointer',
        border: `1px solid ${active ? color : '#e8e8e8'}`,
        background: active ? bg : 'transparent',
        color: active ? color : '#666',
        fontWeight: active ? 600 : 400,
        transition: 'all 0.1s',
    })

    return (
        <div style={{
            position: 'fixed', top: 0, right: 0, width: 300, height: '100vh',
            background: 'rgba(255,255,255,0.98)', backdropFilter: 'blur(12px)',
            boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', zIndex: 19999,
            display: 'flex', flexDirection: 'column', borderLeft: '1px solid #eee',
        }}>
            {/* ---- 標題列 ---- */}
            <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a' }}>🔍 篩選卡片</span>
                    <div style={{ flex: 1 }} />
                    {hasFilter && (
                        <button onClick={clearAll} style={{ fontSize: 11, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                            清除篩選
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid #e8e8e8', background: 'transparent', cursor: 'pointer', fontSize: 14, color: '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >✕</button>
                </div>

                {/* 狀態篩選 */}
                <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5 }}>狀態</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {(['none', 'todo', 'in-progress', 'done'] as CardStatusType[]).map(s => {
                            const cfg = STATUS_CONFIG[s]
                            const active = filterStatuses.has(s)
                            const label = s === 'none' ? '⬜ 無' : s === 'todo' ? '📋 待辦' : s === 'in-progress' ? '🔵 進行中' : '✅ 完成'
                            return (
                                <button key={s} onClick={() => toggleStatus(s)}
                                    style={chipStyle(active, cfg.color, cfg.bg)}
                                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#f5f5f5' }}
                                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                                >{label}</button>
                            )
                        })}
                    </div>
                </div>

                {/* 優先度篩選 */}
                <div style={{ marginBottom: allTags.length > 0 ? 10 : 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5 }}>優先度</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                        {(['none', 'low', 'medium', 'high'] as PriorityType[]).map(p => {
                            const cfg = PRIORITY_CONFIG[p]
                            const active = filterPriorities.has(p)
                            const label = p === 'none' ? '— 無' : p === 'low' ? '🟡 低' : p === 'medium' ? '🟠 中' : '🔴 高'
                            return (
                                <button key={p} onClick={() => togglePriority(p)}
                                    style={chipStyle(active, cfg.color, `${cfg.color}22`)}
                                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#f5f5f5' }}
                                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                                >{label}</button>
                            )
                        })}
                    </div>
                </div>

                {/* 標籤篩選 */}
                {allTags.length > 0 && (
                    <div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5 }}>標籤</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {allTags.map(tag => {
                                const active = filterTag === tag
                                return (
                                    <button key={tag} onClick={() => setFilterTag(active ? null : tag)}
                                        style={chipStyle(active, '#2563eb', '#eff6ff')}
                                        onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#f5f5f5' }}
                                        onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                                    >#{tag}</button>
                                )
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* ---- 結果列表 ---- */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {!hasFilter ? (
                    <div style={{ padding: '36px 16px', textAlign: 'center', color: '#ccc', fontSize: 13 }}>
                        選擇上方條件以篩選卡片
                    </div>
                ) : results.length === 0 ? (
                    <div style={{ padding: '36px 16px', textAlign: 'center', color: '#ccc', fontSize: 13 }}>
                        沒有符合條件的卡片
                    </div>
                ) : (
                    <>
                        <div style={{ padding: '7px 16px 2px', fontSize: 11, color: '#bbb' }}>
                            共 {results.length} 張卡片　點擊跳轉
                        </div>
                        {results.map(r => (
                            <FilterResultRow
                                key={`${r.boardId}_${r.shapeId}`}
                                result={r}
                                onJump={onJump}
                            />
                        ))}
                    </>
                )}
            </div>
        </div>
    )
}
