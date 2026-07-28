// src/SearchPanel.tsx
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { TLEditorSnapshot } from 'tldraw'
import { Z_MODAL_BACKDROP, Z_MODAL } from './constants'
import { stripHtml } from './utils/stringUtils'
import { T } from './theme/tokens'
import { TYPE_ICON, TYPE_LABEL } from './utils/cardMeta'
import type { CardType } from './components/card-shape/type/CardShape'

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
    type: CardType
    preview: string
    x: number
    y: number
}

interface SearchPanelProps {
    boards: BoardRecord[]
    onJump: (boardId: string, shapeId: string, x: number, y: number) => void
    onClose: () => void
}

interface SearchTodo {
    text?: string
    checked?: boolean
}

interface SearchCardProps {
    type?: CardType | string
    text?: string
    todos?: SearchTodo[]
    url?: string
    title?: string
    /** 表格：逐格內容 */
    tableData?: { cells?: { content?: string }[] }[]
    /** 色票：名稱與色碼都可搜 */
    swatches?: { hex?: string; name?: string }[]
    /** 檔案卡 */
    originalName?: string
    fileExt?: string
    /** 白板卡：靠這個查出被連到的白板名稱 */
    linkedBoardId?: string | null
    tags?: string[] | null
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
    type: CardType
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

/**
 * 顯示用片段的長度。**注意索引裡的 preview 是不截斷的全文**——
 * 舊版在建索引時就 slice 成開頭 80 字，導致「關鍵字出現在第 200 字」的卡
 * 在結果列上完全看不到命中的地方，只能看到卡片開頭，無從判斷該不該點進去。
 * 截斷改到顯示時做（buildSnippet），以命中位置為中心取窗口。
 */
// 40 是配合結果列**單行**寬度（面板 520px 扣掉圖示與提示約剩 430px）算的：
// 13px 中文一行大約放得下 33 字，命中落在窗口中央就一定在可視範圍內。
// 設太長（曾經是 90）的話尾端會被 CSS 的 ellipsis 截掉，連高亮一起看不見——
// 那等於白做，畫面上仍然找不到關鍵字在哪。
const SNIPPET_LEN = 40

export interface SnippetPart {
    text: string
    /** 是否為命中的關鍵字（UI 據此標色） */
    hit: boolean
}

function clampText(s: string, maxLen: number): string {
    return s.length <= maxLen ? s : `${s.slice(0, maxLen)}…`
}

/**
 * 把預覽文字裁成「以關鍵字為中心」的片段，並標出命中的位置（純函式）。
 *
 * 關鍵字不在預覽文字裡時退回開頭片段——這是正常情況而非錯誤：
 * 命中的可能是標籤、URL 或表格內容，那些進了 `content` 卻不一定在 `preview` 裡。
 */
export function buildSnippet(source: string, keyword: string, maxLen = SNIPPET_LEN): SnippetPart[] {
    const text = source.trim()
    const kw = keyword.trim()
    if (!text) return []
    if (!kw) return [{ text: clampText(text, maxLen), hit: false }]

    const lower = text.toLowerCase()
    const lowerKw = kw.toLowerCase()
    const first = lower.indexOf(lowerKw)
    if (first < 0) return [{ text: clampText(text, maxLen), hit: false }]

    // 以第一個命中為中心開窗；撞到尾端就往前補，讓窗口盡量填滿 maxLen
    const radius = Math.max(0, Math.floor((maxLen - lowerKw.length) / 2))
    let start = Math.max(0, first - radius)
    const end = Math.min(text.length, start + maxLen)
    if (end - start < maxLen) start = Math.max(0, end - maxLen)

    const parts: SnippetPart[] = []
    if (start > 0) parts.push({ text: '…', hit: false })

    // 窗口內的每一次命中都要標，不是只標第一個
    let cursor = start
    for (;;) {
        const at = lower.indexOf(lowerKw, cursor)
        if (at < 0 || at >= end) break
        if (at > cursor) parts.push({ text: text.slice(cursor, at), hit: false })
        const stop = Math.min(at + lowerKw.length, end)
        parts.push({ text: text.slice(at, stop), hit: true })
        cursor = stop
    }
    if (cursor < end) parts.push({ text: text.slice(cursor, end), hit: false })
    if (end < text.length) parts.push({ text: '…', hit: false })
    return parts
}

/**
 * 一張卡的可搜文字與預覽（純函式）。
 *
 * ⚠️ **每一種 CardType 都必須在這裡有一條分支。** 舊版只處理
 * text/todo/link/image/journal 五種，其餘六種（heading／sticky／table／color／
 * board／file）被 `continue` 直接跳過＝**根本搜不到**，而使用者只會覺得「我明明記過」。
 * 日後新增 CardType 時，這個 switch 是必改的地方之一。
 *
 * `boardNameById` 用來把白板卡解析成它連到的白板名稱——board 卡本身沒有文字。
 */
export function buildCardSearchText(
    props: SearchCardProps,
    boardNameById: Map<string, string>,
): { content: string; preview: string } {
    const plainText = stripHtml(props.text || '')
    let content = ''
    let preview = ''

    switch (props.type) {
        case 'text':
        case 'journal':
        case 'heading':
        // 便利貼的 text 是純文字（含換行），stripHtml 會順便把換行收成空白
        case 'sticky':
            content = plainText
            preview = plainText
            break

        case 'todo': {
            const todos = Array.isArray(props.todos) ? props.todos : []
            content = `${plainText} ${todos.map(t => t.text ?? '').join(' ')}`
            preview = (plainText ? `${plainText}：` : '')
                + todos.map(t => `${t.checked ? '✅' : '☐'} ${t.text ?? ''}`).join('  ')
            break
        }

        case 'link': {
            const titleText = stripHtml(props.title || '')
            content = `${props.url || ''} ${plainText} ${titleText}`
            preview = stripHtml(props.title || props.text || props.url || '')
            break
        }

        case 'image':
            content = plainText
            preview = plainText
            break

        case 'table': {
            const cells = (props.tableData ?? [])
                .flatMap(row => (row.cells ?? []).map(c => c.content ?? ''))
                .filter(Boolean)
            content = cells.join(' ')
            preview = cells.join(' · ')
            break
        }

        case 'color': {
            const swatches = props.swatches ?? []
            // 色碼也納入：「我那個 #3b82f6 放在哪」是真的會發生的搜尋
            content = swatches.map(s => `${s.name ?? ''} ${s.hex ?? ''}`).join(' ')
            preview = swatches.map(s => s.name || s.hex || '').filter(Boolean).join(' · ')
            break
        }

        case 'file':
            content = `${props.originalName ?? ''} ${props.fileExt ?? ''}`
            preview = props.originalName ?? ''
            break

        case 'board': {
            const linkedName = props.linkedBoardId ? boardNameById.get(props.linkedBoardId) ?? '' : ''
            content = linkedName
            preview = linkedName ? `→ ${linkedName}` : ''
            break
        }

        default:
            // 未知型別（例如未來新增但忘了加分支）：至少讓它的文字搜得到，
            // 而不是像舊版那樣整張卡從索引裡消失
            content = plainText
            preview = plainText
    }

    // 標籤對所有型別都可搜：搜「閱讀」應該找得到標了 #閱讀 的卡
    const tags = Array.isArray(props.tags) ? props.tags.filter(Boolean) : []
    if (tags.length > 0) content += ` ${tags.join(' ')}`

    // preview 保留全文：要靠它在顯示時取「關鍵字附近」的片段（見 buildSnippet）
    return { content: content.trim().toLowerCase(), preview: preview.trim() }
}

export function buildSearchIndex(boards: BoardRecord[]): SearchIndexEntry[] {
    const entries: SearchIndexEntry[] = []
    const seen = new Set<string>()
    const boardNameById = new Map(boards.map(b => [b.id, b.name]))

    for (const board of boards) {
        for (const shape of toCardShapes(board.snapshot)) {
            const dedupKey = `${board.id}_${shape.id}`
            if (seen.has(dedupKey)) continue
            seen.add(dedupKey)

            const props = shape.props ?? {}
            const { content, preview } = buildCardSearchText(props, boardNameById)
            // 完全沒有可搜文字的卡（例如空的色票）不進索引——它永遠不會被任何關鍵字命中，
            // 留著只會讓型別篩選的計數看起來不對
            if (!content) continue

            entries.push({
                boardId: board.id,
                boardName: board.name,
                shapeId: shape.id,
                type: (props.type as CardType) ?? 'text',
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

export function searchFromIndex(
    index: SearchIndexEntry[],
    keyword: string,
    typeFilter: CardType | null = null,
): { results: SearchResult[]; total: number } {
    if (!keyword.trim()) return { results: [], total: 0 }
    const kw = keyword.toLowerCase()
    const matched = index.filter(e =>
        e.content.includes(kw) && (typeFilter === null || e.type === typeFilter))
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

/**
 * 命中結果裡出現過的型別（依關鍵字，不受目前篩選影響），供篩選列顯示。
 * 只列「這次搜尋真的搜得到的型別」——列出永遠 0 筆的 chip 只會讓人以為壞了。
 */
export function typeCountsFor(index: SearchIndexEntry[], keyword: string): Map<CardType, number> {
    const counts = new Map<CardType, number>()
    if (!keyword.trim()) return counts
    const kw = keyword.toLowerCase()
    for (const e of index) {
        if (!e.content.includes(kw)) continue
        counts.set(e.type, (counts.get(e.type) ?? 0) + 1)
    }
    return counts
}

function TypeChip({ label, count, active, onClick }: {
    label: string
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
        >{label} <span style={{ opacity: 0.7 }}>{count}</span></button>
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
                                label={`${TYPE_ICON[type]} ${TYPE_LABEL[type]}`}
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
                                    <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{TYPE_ICON[r.type]}</span>
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
