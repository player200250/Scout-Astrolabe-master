// src/SearchPanel.tsx
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { TLEditorSnapshot } from 'tldraw'
import { Z_MODAL_BACKDROP, Z_MODAL } from './constants'
import { stripHtml } from './utils/stringUtils'

// ── 資料型別 ────────────────────────────────────────────────────────────────

interface BoardRecord {
    id: string
    name: string
    snapshot: TLEditorSnapshot | null
    thumbnail: string | null
    updatedAt: number
}

interface SearchResult {
    boardId: string
    boardName: string
    shapeId: string
    type: 'text' | 'todo' | 'link' | 'image' | 'journal'
    preview: string
    x: number
    y: number
}

interface SearchPanelProps {
    boards: BoardRecord[]
    onJump: (boardId: string, shapeId: string, x: number, y: number) => void
    onClose: () => void
    isDark: boolean
}

interface SearchTodo {
    text?: string
    checked?: boolean
}

interface SearchCardProps {
    type?: 'text' | 'todo' | 'link' | 'image' | 'journal' | string
    text?: string
    todos?: SearchTodo[]
    url?: string
    title?: string
}

interface SearchShape {
    id: string
    typeName?: string
    type?: string
    x?: number
    y?: number
    props?: SearchCardProps
}

// ── 搜尋索引型別（boards 變更時才重建，避免重複計算）──────────────────────

interface SearchIndexEntry {
    boardId: string
    boardName: string
    shapeId: string
    type: 'text' | 'todo' | 'link' | 'image' | 'journal'
    /** 預處理為 lowercase，供搜尋時直接 includes 比對 */
    content: string
    /** 原始預覽文字（用於 UI 顯示） */
    preview: string
    x: number
    y: number
}

// ── 最多顯示筆數 ─────────────────────────────────────────────────────────────

const MAX_RESULTS = 50

// ── 工具函式 ─────────────────────────────────────────────────────────────────

function toCardShapes(snapshot: TLEditorSnapshot | null): SearchShape[] {
    const store = (snapshot as { document?: { store?: Record<string, unknown> } } | null)?.document?.store
    if (!store) return []
    return Object.values(store)
        .filter((record): record is SearchShape => typeof record === 'object' && record !== null)
        .filter(shape => shape.typeName === 'shape' && shape.type === 'card')
}

// ── 索引建立（純函式，由 useMemo 快取）─────────────────────────────────────
// 每筆 entry 的 content 已預先 lowercase，搜尋時只需一次 includes 比對

function buildSearchIndex(boards: BoardRecord[]): SearchIndexEntry[] {
    const entries: SearchIndexEntry[] = []
    const seen = new Set<string>()

    for (const board of boards) {
        for (const shape of toCardShapes(board.snapshot)) {
            const dedupKey = `${board.id}_${shape.id}`
            if (seen.has(dedupKey)) continue
            seen.add(dedupKey)

            const props = shape.props ?? {}
            const cardType = props.type

            if (
                cardType !== 'text' && cardType !== 'todo' &&
                cardType !== 'link' && cardType !== 'image' && cardType !== 'journal'
            ) continue

            let content = ''
            let preview = ''

            if (cardType === 'text' || cardType === 'journal') {
                const plain = stripHtml(props.text || '')
                content = plain.toLowerCase()
                preview = plain.slice(0, 80)
            } else if (cardType === 'todo') {
                const titlePlain = stripHtml(props.text || '')
                const todosText = Array.isArray(props.todos)
                    ? props.todos.map(t => t.text ?? '').join(' ')
                    : ''
                content = `${titlePlain} ${todosText}`.toLowerCase()
                const titlePart = titlePlain ? `${titlePlain}：` : ''
                const todosPart = Array.isArray(props.todos)
                    ? props.todos.map(t => `${t.checked ? '✅' : '☐'} ${t.text ?? ''}`).join('  ')
                    : ''
                preview = (titlePart + todosPart).slice(0, 80)
            } else if (cardType === 'link') {
                const urlText = props.url || ''
                const bodyText = stripHtml(props.text || '')
                const titleText = stripHtml(props.title || '')
                content = `${urlText} ${bodyText} ${titleText}`.toLowerCase()
                preview = stripHtml(props.title || props.text || props.url || '').slice(0, 80)
            } else if (cardType === 'image') {
                content = (props.text || '').toLowerCase()
                preview = (props.text || '').slice(0, 80)
            }

            entries.push({
                boardId: board.id,
                boardName: board.name,
                shapeId: shape.id,
                type: cardType,
                content,
                preview,
                x: shape.x ?? 0,
                y: shape.y ?? 0,
            })
        }
    }

    return entries
}

// ── 搜尋（純函式，掃描索引，不碰 snapshot）──────────────────────────────────

function searchFromIndex(
    index: SearchIndexEntry[],
    keyword: string,
): { results: SearchResult[]; total: number } {
    if (!keyword.trim()) return { results: [], total: 0 }
    const kw = keyword.toLowerCase()
    const matched = index.filter(e => e.content.includes(kw))
    return {
        results: matched.slice(0, MAX_RESULTS).map(e => ({
            boardId: e.boardId,
            boardName: e.boardName,
            shapeId: e.shapeId,
            type: e.type,
            preview: e.preview,
            x: e.x,
            y: e.y,
        })),
        total: matched.length,
    }
}

// ── UI ───────────────────────────────────────────────────────────────────────

const typeIcon: Record<string, string> = {
    text: '📝', todo: '✅', link: '🔗', image: '🖼️', journal: '📔',
}

export function SearchPanel({ boards, onJump, onClose, isDark }: SearchPanelProps) {
    const [query, setQuery] = useState('')
    const [debouncedQuery, setDebouncedQuery] = useState('')
    const [selectedIdx, setSelectedIdx] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)

    // 自動聚焦
    useEffect(() => { inputRef.current?.focus() }, [])

    // 300ms debounce：打字時不立即搜尋，等停頓才觸發
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQuery(query), 300)
        return () => clearTimeout(timer)
    }, [query])

    // 索引：boards 變更時才重建（stripHtml、snapshot parse 只做一次）
    const searchIndex = useMemo(() => buildSearchIndex(boards), [boards])

    // 搜尋結果：索引或 debouncedQuery 變更時重新計算（不碰 snapshot）
    const { results, total } = useMemo(
        () => searchFromIndex(searchIndex, debouncedQuery),
        [searchIndex, debouncedQuery],
    )

    // query 改變時重置選取位置
    useEffect(() => { setSelectedIdx(0) }, [debouncedQuery])

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Escape') { onClose() }
        else if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, results.length - 1)) }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)) }
        else if (e.key === 'Enter' && results[selectedIdx]) {
            const r = results[selectedIdx]
            onJump(r.boardId, r.shapeId, r.x, r.y)
        }
    }, [results, selectedIdx, onClose, onJump])

    const bg = isDark ? '#1e293b' : '#fff'
    const textPrimary = isDark ? '#e2e8f0' : '#1a1a1a'
    const border = isDark ? '#334155' : '#f0f0f0'
    const rowBorder = isDark ? '#334155' : '#f5f5f5'
    const hoverBg = isDark ? '#1e3a5f' : '#f0f4ff'
    const clearBg = isDark ? '#334155' : '#f0f0f0'
    const clearColor = isDark ? '#94a3b8' : '#666'
    const mutedColor = isDark ? '#94a3b8' : '#aaa'

    const hasMore = total > MAX_RESULTS

    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: Z_MODAL_BACKDROP }} />
            <div style={{
                position: 'fixed', top: '15%', left: '50%', transform: 'translateX(-50%)',
                width: 520, maxWidth: '90vw', background: bg,
                borderRadius: 14, boxShadow: '0 8px 40px rgba(0,0,0,0.18)', zIndex: Z_MODAL, overflow: 'hidden',
            }}>
                <div style={{
                    display: 'flex', alignItems: 'center',
                    padding: '12px 16px',
                    borderBottom: results.length > 0 ? `1px solid ${border}` : 'none',
                    gap: 10,
                }}>
                    <span style={{ fontSize: 18, color: '#999' }}>🔍</span>
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="搜尋所有白板的卡片..."
                        style={{ flex: 1, border: 'none', outline: 'none', fontSize: 16, color: textPrimary, background: 'transparent' }}
                    />
                    {query && (
                        <button
                            onClick={() => setQuery('')}
                            style={{
                                border: 'none', background: clearBg, borderRadius: '50%',
                                width: 20, height: 20, cursor: 'pointer', fontSize: 12, color: clearColor,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                            }}
                        >×</button>
                    )}
                </div>

                {query && (
                    <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                        {results.length === 0 ? (
                            // 打字中（query ≠ debouncedQuery）顯示「搜尋中...」，否則顯示「找不到」
                            query !== debouncedQuery ? (
                                <div style={{ padding: '24px 16px', textAlign: 'center', color: mutedColor, fontSize: 14 }}>
                                    搜尋中...
                                </div>
                            ) : (
                                <div style={{ padding: '24px 16px', textAlign: 'center', color: mutedColor, fontSize: 14 }}>
                                    找不到符合「{debouncedQuery}」的卡片
                                </div>
                            )
                        ) : (
                            results.map((r, idx) => (
                                <div
                                    key={`${r.boardId}_${r.shapeId}`}
                                    onClick={() => onJump(r.boardId, r.shapeId, r.x, r.y)}
                                    onMouseEnter={() => setSelectedIdx(idx)}
                                    style={{
                                        padding: '10px 16px', cursor: 'pointer',
                                        background: idx === selectedIdx ? hoverBg : 'transparent',
                                        borderBottom: `1px solid ${rowBorder}`,
                                        display: 'flex', alignItems: 'flex-start', gap: 10,
                                    }}
                                >
                                    <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{typeIcon[r.type]}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, color: textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {r.preview || '(無內容)'}
                                        </div>
                                        <div style={{ fontSize: 11, color: mutedColor, marginTop: 2 }}>{r.boardName}</div>
                                    </div>
                                    <span style={{ fontSize: 11, color: '#bbb', flexShrink: 0, alignSelf: 'center' }}>Enter ↵</span>
                                </div>
                            ))
                        )}
                        {results.length > 0 && (
                            <div style={{ padding: '8px 16px', fontSize: 11, color: '#bbb', borderTop: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>
                                    {hasMore
                                        ? `顯示前 ${MAX_RESULTS} 筆，還有 ${total - MAX_RESULTS} 筆未顯示（請縮小關鍵字）`
                                        : `共 ${total} 筆結果`
                                    }
                                </span>
                                <span>↑↓ 導航 &nbsp; Enter 跳轉 &nbsp; Esc 關閉</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
    )
}
