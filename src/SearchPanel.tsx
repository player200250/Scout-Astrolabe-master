// src/SearchPanel.tsx
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import { Z_MODAL_BACKDROP, Z_MODAL, MODAL_TOP, MODAL_WIDTH, MODAL_BACKDROP } from './constants'
import { T } from './theme/tokens'
import { CARD_TYPE_ICON, TYPE_LABEL } from './utils/cardMeta'
import { Icon } from './components/ui/icons'
import type { CardType } from './components/card-shape/type/CardShape'
// 搜尋的純邏輯住在 utils/searchIndex.ts——元件檔只留元件，
// 免得 react-refresh 的熱更新因為混合匯出而退化成整頁重載。
import {
    buildSearchIndex, searchFromIndex, typeCountsFor, buildSnippet, MAX_RESULTS,
} from './utils/searchIndex'
import type { BoardRecord } from './utils/searchIndex'

interface SearchPanelProps {
    boards: BoardRecord[]
    onJump: (boardId: string, shapeId: string, x: number, y: number) => void
    onClose: () => void
}

function TypeChip({ label, count, active, onClick }: {
    // ReactNode 而非 string：型別 chip 現在是「圖示＋文字」，不是一串含 emoji 的字
    label: ReactNode
    count: number
    active: boolean
    onClick: () => void
}) {
    return (
        <button
            onClick={onClick}
            style={{
                padding: '3px 9px', fontSize: 11.5, borderRadius: 999, cursor: 'pointer',
                fontFamily: 'inherit', lineHeight: 1.6,
                border: `1px solid ${active ? T.accent : T.borderLight}`,
                background: active ? T.accentBg : 'transparent',
                color: active ? T.accent : T.textSecondary,
                fontWeight: active ? 600 : 400,
            }}
        ><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{label}</span> <span style={{ opacity: 0.7 }}>{count}</span></button>
    )
}

export function SearchPanel({ boards, onJump, onClose }: SearchPanelProps) {
    const [query, setQuery] = useState('')
    const [debouncedQuery, setDebouncedQuery] = useState('')
    const [selectedIdx, setSelectedIdx] = useState(0)
    const [typeFilter, setTypeFilter] = useState<CardType | null>(null)
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

    // 搜尋結果：索引、關鍵字或型別篩選變更時重新計算（不碰 snapshot）
    const { results, total } = useMemo(
        () => searchFromIndex(searchIndex, debouncedQuery, typeFilter),
        [searchIndex, debouncedQuery, typeFilter],
    )

    // 篩選列只列這次關鍵字真的搜得到的型別（不受目前選了哪個影響，否則選下去列會塌掉）
    const typeCounts = useMemo(
        () => typeCountsFor(searchIndex, debouncedQuery),
        [searchIndex, debouncedQuery],
    )

    // query 改變時重置選取位置；若原本選的型別在新關鍵字下一筆都沒有，回到「全部」
    useEffect(() => { setSelectedIdx(0) }, [debouncedQuery, typeFilter])
    useEffect(() => {
        if (typeFilter !== null && !typeCounts.has(typeFilter)) setTypeFilter(null)
    }, [typeCounts, typeFilter])

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Escape') { onClose() }
        else if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, results.length - 1)) }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)) }
        else if (e.key === 'Enter' && results[selectedIdx]) {
            const r = results[selectedIdx]
            onJump(r.boardId, r.shapeId, r.x, r.y)
        }
    }, [results, selectedIdx, onClose, onJump])

    const bg = T.bgPanel
    const textPrimary = T.textPrimary
    const border = T.borderLight
    const rowBorder = T.borderLight
    const hoverBg = T.accentBg
    const clearBg = T.bgHover
    const clearColor = T.textSecondary
    const mutedColor = T.textMuted

    const hasMore = total > MAX_RESULTS

    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: MODAL_BACKDROP, zIndex: Z_MODAL_BACKDROP }} />
            <div style={{
                position: 'fixed', top: MODAL_TOP, left: '50%', transform: 'translateX(-50%)',
                width: MODAL_WIDTH, maxWidth: '92vw', background: bg,
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

                {/* B3 型別篩選：只列這次關鍵字真的搜得到的型別，避免出現永遠 0 筆的 chip */}
                {typeCounts.size > 1 && (
                    <div style={{
                        display: 'flex', gap: 6, flexWrap: 'wrap',
                        padding: '8px 16px', borderBottom: `1px solid ${border}`,
                    }}>
                        <TypeChip
                            label="全部" count={total === 0 ? 0 : [...typeCounts.values()].reduce((a, b) => a + b, 0)}
                            active={typeFilter === null} onClick={() => setTypeFilter(null)}
                        />
                        {[...typeCounts.entries()].map(([type, count]) => (
                            <TypeChip
                                key={type}
                                label={<><Icon name={CARD_TYPE_ICON[type]} />{TYPE_LABEL[type]}</>}
                                count={count}
                                active={typeFilter === type}
                                onClick={() => setTypeFilter(type)}
                            />
                        ))}
                    </div>
                )}

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
                                    <span style={{ flexShrink: 0, marginTop: 3, color: T.textMuted, display: 'flex' }}><Icon name={CARD_TYPE_ICON[r.type]} size="md" /></span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, color: textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {r.preview
                                                ? buildSnippet(r.preview, debouncedQuery).map((part, i) => (
                                                    part.hit
                                                        ? <mark key={i} style={{
                                                            background: T.accentBg, color: T.accent,
                                                            fontWeight: 700, borderRadius: 3, padding: '0 2px',
                                                        }}>{part.text}</mark>
                                                        : <span key={i}>{part.text}</span>
                                                ))
                                                : '(無內容)'}
                                        </div>
                                        <div style={{ fontSize: 11, color: mutedColor, marginTop: 2 }}>{r.boardName}</div>
                                    </div>
                                    {/* 只有選中列按 Enter 才有作用，每列都印一次是純噪音 */}
                                    {idx === selectedIdx && (
                                        <span style={{ fontSize: 11, color: '#bbb', flexShrink: 0, alignSelf: 'center' }}>Enter ↵</span>
                                    )}
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
