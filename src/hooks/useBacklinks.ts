// src/hooks/useBacklinks.ts
import { useRef, createContext } from 'react'
import type { TLEditorSnapshot } from 'tldraw'
import { getSnapshotStore } from '../utils/snapshot'

/* ---------------------------------------------------------------
   型別
--------------------------------------------------------------- */
interface BoardRecord {
    id: string
    name: string
    snapshot: TLEditorSnapshot | null
}

export interface BacklinkEntry {
    boardId: string
    boardName: string
    shapeId: string
    preview: string
    x: number
    y: number
}

export interface BacklinksContextValue {
    /** shapeId → [[xxx]] 中引用的名稱清單 */
    forwardLinks: Map<string, string[]>
    /** targetName.toLowerCase() → 引用該名稱的卡片清單 */
    backlinks: Map<string, BacklinkEntry[]>
    /** 所有白板名稱，供補全選單使用 */
    boardNames: string[]
    /** 當前白板名稱，供 BacklinksPanel 查詢白板級引用 */
    currentBoardName?: string
}

export const BacklinksContext = createContext<BacklinksContextValue>({
    forwardLinks: new Map(),
    backlinks: new Map(),
    boardNames: [],
})

/* ---------------------------------------------------------------
   工具函式
--------------------------------------------------------------- */
function stripHtml(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

/** 從 HTML 擷取 [[xxx]] 裡的 xxx，去重後回傳 */
function extractLinks(html: string): string[] {
    const text = stripHtml(html)
    const matches = [...text.matchAll(/\[\[([^\]]+)\]\]/g)]
    return [...new Set(matches.map(m => m[1].trim()).filter(Boolean))]
}

/**
 * 取得卡片的「標準名稱」：
 * 優先使用第一個 H1/H2 標題文字；
 * 沒有標題就取前 40 個字元的純文字。
 */
export function extractCardName(html: string): string | null {
    if (!html) return null
    const hMatch = html.match(/<h[12][^>]*>(.*?)<\/h[12]>/i)
    if (hMatch) {
        const name = hMatch[1].replace(/<[^>]+>/g, '').trim()
        if (name) return name
    }
    const text = stripHtml(html)
    return text.slice(0, 40) || null
}

/* ---------------------------------------------------------------
   主 Hook（增量更新：只重掃 snapshot 有異動的白板）
--------------------------------------------------------------- */
type BoardCache = {
    snapshot: TLEditorSnapshot | null
    name: string
    forwardLinks: Map<string, string[]>
    backlinks: Map<string, BacklinkEntry[]>
}

function scanBoard(board: BoardRecord): Pick<BoardCache, 'forwardLinks' | 'backlinks'> {
    const forwardLinks = new Map<string, string[]>()
    const backlinks = new Map<string, BacklinkEntry[]>()
    if (!board.snapshot) return { forwardLinks, backlinks }

    const store = getSnapshotStore(board.snapshot)
    for (const shape of Object.values(store)) {
        if (shape.typeName !== 'shape' || shape.type !== 'card') continue
        const ptype = shape.props?.type
        if (ptype !== 'text' && ptype !== 'journal') continue
        const html = shape.props?.text ?? ''
        if (!html) continue

        const links = extractLinks(html)
        if (links.length === 0) continue

        forwardLinks.set(shape.id, links)
        const preview = stripHtml(html).slice(0, 80)
        for (const name of links) {
            const key = name.toLowerCase()
            if (!backlinks.has(key)) backlinks.set(key, [])
            backlinks.get(key)!.push({
                boardId: board.id,
                boardName: board.name,
                shapeId: shape.id,
                preview,
                x: shape.x ?? 0,
                y: shape.y ?? 0,
            })
        }
    }
    return { forwardLinks, backlinks }
}

export function useBacklinks(boards: BoardRecord[]): Omit<BacklinksContextValue, 'boardNames'> {
    const cacheRef = useRef<Map<string, BoardCache>>(new Map())
    const resultRef = useRef<Omit<BacklinksContextValue, 'boardNames'> | null>(null)

    const currentIds = new Set(boards.map(b => b.id))
    const removedIds = [...cacheRef.current.keys()].filter(id => !currentIds.has(id))
    const changedBoards = boards.filter(b => {
        const c = cacheRef.current.get(b.id)
        return !c || c.snapshot !== b.snapshot || c.name !== b.name
    })

    if (changedBoards.length === 0 && removedIds.length === 0 && resultRef.current) {
        return resultRef.current
    }

    for (const id of removedIds) cacheRef.current.delete(id)

    for (const board of changedBoards) {
        const { forwardLinks, backlinks } = scanBoard(board)
        cacheRef.current.set(board.id, { snapshot: board.snapshot, name: board.name, forwardLinks, backlinks })
    }

    // Merge all per-board caches into final Maps
    const mergedForward = new Map<string, string[]>()
    const mergedBack = new Map<string, BacklinkEntry[]>()
    for (const { forwardLinks, backlinks } of cacheRef.current.values()) {
        for (const [k, v] of forwardLinks) mergedForward.set(k, v)
        for (const [k, vs] of backlinks) {
            const arr = mergedBack.get(k)
            if (arr) arr.push(...vs)
            else mergedBack.set(k, [...vs])
        }
    }

    resultRef.current = { forwardLinks: mergedForward, backlinks: mergedBack }
    return resultRef.current
}
