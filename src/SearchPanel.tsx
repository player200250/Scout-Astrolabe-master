// src/SearchPanel.tsx
import { useState, useEffect, useRef, useCallback } from 'react'
import type { TLEditorSnapshot } from 'tldraw'

/* ---------------------------------------------------------------
   型別
--------------------------------------------------------------- */
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
    type: 'text' | 'todo' | 'link' | 'image'
    preview: string  // 顯示的摘要文字
    x: number
    y: number
}

interface SearchPanelProps {
    boards: BoardRecord[]
    onJump: (boardId: string, shapeId: string, x: number, y: number) => void
    onClose: () => void
}

/* ---------------------------------------------------------------
   工具函式：剝掉 HTML 標籤，取得純文字
--------------------------------------------------------------- */
function stripHtml(html: string): string {
    return html
        .replace(/<[^>]*>/g, ' ')   // 標籤換成空格
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ')       // 多個空格合併
        .trim()
}

/* ---------------------------------------------------------------
   搜尋邏輯
--------------------------------------------------------------- */
function searchBoards(boards: BoardRecord[], keyword: string): SearchResult[] {
    if (!keyword.trim()) return []
    const kw = keyword.toLowerCase()
    const results: SearchResult[] = []
    const seenIds = new Set<string>()  // 用來去重

    for (const board of boards) {
        if (!board.snapshot) continue
        const store = (board.snapshot as any).document?.store ?? {}
        const shapes = Object.values(store)

        for (const shape of shapes as any[]) {
            // 只處理 card shape，且不重複
            if (shape.typeName !== 'shape' || shape.type !== 'card') continue
            const dedupKey = `${board.id}_${shape.id}`
            if (seenIds.has(dedupKey)) continue
            seenIds.add(dedupKey)

            const props = shape.props
            let matched = false
            let preview = ''

            if (props.type === 'text' && props.text) {
                const plain = stripHtml(props.text)
                if (plain.toLowerCase().includes(kw)) {
                    matched = true
                    preview = plain.slice(0, 80)
                }
            } else if (props.type === 'todo') {
                // 比對標題
                const titlePlain = stripHtml(props.text || '')
                const titleHit = titlePlain.toLowerCase().includes(kw)
                // 比對每一條 todo
                const todoHit = Array.isArray(props.todos)
                    ? props.todos.find((t: any) => t.text?.toLowerCase().includes(kw))
                    : null
                if (titleHit || todoHit) {
                    matched = true
                    const titlePart = titlePlain ? `${titlePlain}：` : ''
                    const todosPart = Array.isArray(props.todos)
                        ? props.todos.map((t: any) => `${t.checked ? '✅' : '☐'} ${t.text}`).join('  ')
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
                if (props.text?.toLowerCase().includes(kw)) {
                    matched = true
                    preview = props.text.slice(0, 80)
                }
            }

            if (matched) {
                results.push({
                    boardId: board.id,
                    boardName: board.name,
                    shapeId: shape.id,
                    type: props.type,
                    preview,
                    x: shape.x ?? 0,
                    y: shape.y ?? 0,
                })
            }
        }
    }

    return results
}

/* ---------------------------------------------------------------
   卡片類型 icon
--------------------------------------------------------------- */
const typeIcon: Record<string, string> = {
    text: '📝',
    todo: '✅',
    link: '🔗',
    image: '🖼️',
}

/* ---------------------------------------------------------------
   SearchPanel 元件
--------------------------------------------------------------- */
export function SearchPanel({ boards, onJump, onClose }: SearchPanelProps) {
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<SearchResult[]>([])
    const [selectedIdx, setSelectedIdx] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)

    // 自動 focus
    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    // 搜尋
    useEffect(() => {
        const r = searchBoards(boards, query)
        setResults(r)
        setSelectedIdx(0)
    }, [query, boards])

    // 鍵盤導航
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            onClose()
        } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            setSelectedIdx(i => Math.min(i + 1, results.length - 1))
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setSelectedIdx(i => Math.max(i - 1, 0))
        } else if (e.key === 'Enter' && results[selectedIdx]) {
            const r = results[selectedIdx]
            onJump(r.boardId, r.shapeId, r.x, r.y)
        }
    }, [results, selectedIdx, onClose, onJump])

    return (
        <>
            {/* 背景遮罩 */}
            <div
                onClick={onClose}
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.25)',
                    zIndex: 99998,
                }}
            />

            {/* 搜尋面板 */}
            <div style={{
                position: 'fixed',
                top: '15%',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 520,
                maxWidth: '90vw',
                background: '#fff',
                borderRadius: 14,
                boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
                zIndex: 99999,
                overflow: 'hidden',
            }}>
                {/* 搜尋輸入框 */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '12px 16px',
                    borderBottom: results.length > 0 ? '1px solid #f0f0f0' : 'none',
                    gap: 10,
                }}>
                    <span style={{ fontSize: 18, color: '#999' }}>🔍</span>
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="搜尋所有白板的卡片..."
                        style={{
                            flex: 1,
                            border: 'none',
                            outline: 'none',
                            fontSize: 16,
                            color: '#1a1a1a',
                            background: 'transparent',
                        }}
                    />
                    {query && (
                        <button
                            onClick={() => setQuery('')}
                            style={{
                                border: 'none',
                                background: '#f0f0f0',
                                borderRadius: '50%',
                                width: 20,
                                height: 20,
                                cursor: 'pointer',
                                fontSize: 12,
                                color: '#666',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: 0,
                            }}
                        >×</button>
                    )}
                </div>

                {/* 搜尋結果 */}
                {query && (
                    <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                        {results.length === 0 ? (
                            <div style={{
                                padding: '24px 16px',
                                textAlign: 'center',
                                color: '#aaa',
                                fontSize: 14,
                            }}>
                                找不到符合「{query}」的卡片
                            </div>
                        ) : (
                            results.map((r, idx) => (
                                <div
                                    key={`${r.boardId}_${r.shapeId}`}
                                    onClick={() => onJump(r.boardId, r.shapeId, r.x, r.y)}
                                    onMouseEnter={() => setSelectedIdx(idx)}
                                    style={{
                                        padding: '10px 16px',
                                        cursor: 'pointer',
                                        background: idx === selectedIdx ? '#f0f4ff' : 'transparent',
                                        borderBottom: '1px solid #f5f5f5',
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: 10,
                                    }}
                                >
                                    <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>
                                        {typeIcon[r.type]}
                                    </span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                            fontSize: 13,
                                            color: '#1a1a1a',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                        }}>
                                            {r.preview || '(無內容)'}
                                        </div>
                                        <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
                                            {r.boardName}
                                        </div>
                                    </div>
                                    <span style={{
                                        fontSize: 11,
                                        color: '#bbb',
                                        flexShrink: 0,
                                        alignSelf: 'center',
                                    }}>
                                        Enter ↵
                                    </span>
                                </div>
                            ))
                        )}

                        {/* 結果數量 */}
                        {results.length > 0 && (
                            <div style={{
                                padding: '8px 16px',
                                fontSize: 11,
                                color: '#bbb',
                                textAlign: 'right',
                                borderTop: '1px solid #f0f0f0',
                            }}>
                                共 {results.length} 筆結果　↑↓ 導航　Enter 跳轉　Esc 關閉
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
    )
}