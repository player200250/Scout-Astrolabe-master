// src/SearchPanel.tsx
import { useState, useEffect, useRef, useCallback } from 'react'
import type { TLEditorSnapshot } from 'tldraw'

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

function toCardShapes(snapshot: TLEditorSnapshot | null): SearchShape[] {
    const store = (snapshot as { document?: { store?: Record<string, unknown> } } | null)?.document?.store
    if (!store) return []
    return Object.values(store)
        .filter((record): record is SearchShape => typeof record === 'object' && record !== null)
        .filter(shape => shape.typeName === 'shape' && shape.type === 'card')
}

function stripHtml(html: string): string {
    return html
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ')
        .trim()
}

function searchBoards(boards: BoardRecord[], keyword: string): SearchResult[] {
    if (!keyword.trim()) return []
    const kw = keyword.toLowerCase()
    const results: SearchResult[] = []
    const seenIds = new Set<string>()

    for (const board of boards) {
        for (const shape of toCardShapes(board.snapshot)) {
            const dedupKey = `${board.id}_${shape.id}`
            if (seenIds.has(dedupKey)) continue
            seenIds.add(dedupKey)

            const props = shape.props ?? {}
            let matched = false
            let preview = ''

            if (props.type === 'text' && props.text) {
                const plain = stripHtml(props.text)
                if (plain.toLowerCase().includes(kw)) { matched = true; preview = plain.slice(0, 80) }
            } else if (props.type === 'todo') {
                const titlePlain = stripHtml(props.text || '')
                const titleHit = titlePlain.toLowerCase().includes(kw)
                const todoHit = Array.isArray(props.todos) ? props.todos.find(t => t.text?.toLowerCase().includes(kw)) : null
                if (titleHit || todoHit) {
                    matched = true
                    const titlePart = titlePlain ? `${titlePlain}：` : ''
                    const todosPart = Array.isArray(props.todos)
                        ? props.todos.map(t => `${t.checked ? '✅' : '☐'} ${t.text ?? ''}`).join('  ')
                        : ''
                    preview = (titlePart + todosPart).slice(0, 80)
                }
            } else if (props.type === 'link') {
                const inUrl = props.url?.toLowerCase().includes(kw)
                const inText = stripHtml(props.text || '').toLowerCase().includes(kw)
                const inTitle = stripHtml(props.title || '').toLowerCase().includes(kw)
                if (inUrl || inText || inTitle) {
                    matched = true
                    preview = stripHtml(props.title || props.text || props.url || '').slice(0, 80)
                }
            } else if (props.type === 'image') {
                if (props.text?.toLowerCase().includes(kw)) { matched = true; preview = props.text.slice(0, 80) }
            } else if (props.type === 'journal') {
                const plain = stripHtml(props.text || '')
                if (plain.toLowerCase().includes(kw)) { matched = true; preview = plain.slice(0, 80) }
            }

            if (matched) {
                const resultType = props.type
                results.push({
                    boardId: board.id, boardName: board.name, shapeId: shape.id,
                    type: (resultType === 'text' || resultType === 'todo' || resultType === 'link' || resultType === 'image' || resultType === 'journal') ? resultType : 'text',
                    preview, x: shape.x ?? 0, y: shape.y ?? 0,
                })
            }
        }
    }
    return results
}

const typeIcon: Record<string, string> = { text: '📝', todo: '✅', link: '🔗', image: '🖼️', journal: '📔' }

export function SearchPanel({ boards, onJump, onClose, isDark }: SearchPanelProps) {
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<SearchResult[]>([])
    const [selectedIdx, setSelectedIdx] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => { inputRef.current?.focus() }, [])

    useEffect(() => {
        const r = searchBoards(boards, query)
        setResults(r)
        setSelectedIdx(0)
    }, [query, boards])

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

    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 99998 }} />
            <div style={{
                position: 'fixed', top: '15%', left: '50%', transform: 'translateX(-50%)',
                width: 520, maxWidth: '90vw', background: bg,
                borderRadius: 14, boxShadow: '0 8px 40px rgba(0,0,0,0.18)', zIndex: 99999, overflow: 'hidden',
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
                            <div style={{ padding: '24px 16px', textAlign: 'center', color: '#aaa', fontSize: 14 }}>
                                找不到符合「{query}」的卡片
                            </div>
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
                                        <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{r.boardName}</div>
                                    </div>
                                    <span style={{ fontSize: 11, color: '#bbb', flexShrink: 0, alignSelf: 'center' }}>Enter ↵</span>
                                </div>
                            ))
                        )}
                        {results.length > 0 && (
                            <div style={{ padding: '8px 16px', fontSize: 11, color: '#bbb', textAlign: 'right', borderTop: `1px solid ${border}` }}>
                                共 {results.length} 筆結果 ↑↓ 導航 Enter 跳轉 Esc 關閉
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
    )
}
