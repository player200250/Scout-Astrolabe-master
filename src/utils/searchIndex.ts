// src/utils/searchIndex.ts — 搜尋的純邏輯（索引建立、比對、片段裁切）
//
// 這些函式原本住在 `SearchPanel.tsx` 裡，因為要寫單元測試而從元件檔匯出。
// 那會踩到 `react-refresh/only-export-components`——該規則要求「匯出元件的檔案只匯出元件」，
// 混著匯出函式會讓 Vite 的熱更新退化成整頁重載。搬到這裡兩邊都成立：
// 元件檔只留元件、純邏輯獨立可測。
import type { TLEditorSnapshot } from 'tldraw'
import { stripHtml } from './stringUtils'
import type { CardType } from '../components/card-shape/type/CardShape'

// ── 資料型別 ────────────────────────────────────────────────────────────────

export interface BoardRecord {
    id: string
    name: string
    snapshot: TLEditorSnapshot | null
    thumbnail: string | null
    updatedAt: number
}

export interface SearchResult {
    boardId: string
    boardName: string
    shapeId: string
    type: CardType
    preview: string
    x: number
    y: number
}

interface SearchTodo {
    text?: string
    checked?: boolean
}

export interface SearchCardProps {
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

export interface SearchIndexEntry {
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

export const MAX_RESULTS = 50

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
        // 這四種共用同一段：便利貼的 text 是純文字（含換行），
        // stripHtml 會順便把換行收成空白。
        // （註解放在整組之前，夾在 case 之間會觸發 no-fallthrough 的預設判斷。）
        case 'text':
        case 'journal':
        case 'heading':
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
