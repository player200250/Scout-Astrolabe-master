// src/hooks/useBacklinks.ts
import { useRef, createContext } from 'react'
import type { TLEditorSnapshot } from 'tldraw'
import { getSnapshotStore } from '../utils/snapshot'
import { stripHtml } from '../utils/stringUtils'

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

/** 一張可被 `[[名稱]]` 指到的卡片（含跳轉所需的座標） */
export interface CardTarget {
    boardId: string
    boardName: string
    shapeId: string
    name: string
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
    /**
     * cardName.toLowerCase() → 同名卡片清單（撞名時取 [0]，與 knowledgeGraph 一致）。
     * 供 `[[卡片名]]` 跳轉（B-LINK）與補全選單使用。
     */
    cardIndex: Map<string, CardTarget[]>
    /** 當前白板名稱，供 BacklinksPanel 查詢白板級引用 */
    currentBoardName?: string
}

export const BacklinksContext = createContext<BacklinksContextValue>({
    forwardLinks: new Map(),
    backlinks: new Map(),
    boardNames: [],
    cardIndex: new Map(),
})

/* ---------------------------------------------------------------
   工具函式
--------------------------------------------------------------- */
/** 從純文字擷取 [[xxx]] 裡的 xxx，去重後回傳 */
function linksFromText(text: string): string[] {
    const matches = [...text.matchAll(/\[\[([^\]]+)\]\]/g)]
    return [...new Set(matches.map(m => m[1].trim()).filter(Boolean))]
}

/** 第一個 H1/H2 的純文字（沒有就 null） */
function headingName(html: string): string | null {
    const hMatch = html.match(/<h[12][^>]*>(.*?)<\/h[12]>/i)
    if (!hMatch) return null
    return hMatch[1].replace(/<[^>]+>/g, '').trim() || null
}

/** 卡片名稱：優先 H1/H2，否則取前 40 字純文字。純文字已算好時用這個，避免重跑 stripHtml。 */
function cardNameFrom(html: string, plainText: string): string | null {
    return headingName(html) ?? (plainText.slice(0, 40) || null)
}

/**
 * 取得卡片的「標準名稱」：
 * 優先使用第一個 H1/H2 標題文字；
 * 沒有標題就取前 40 個字元的純文字。
 */
export function extractCardName(html: string): string | null {
    if (!html) return null
    // 有標題就不必 stripHtml（DOMParser 很貴）
    return headingName(html) ?? (stripHtml(html).slice(0, 40) || null)
}

/* ---------------------------------------------------------------
   主 Hook（增量更新：只重掃 snapshot 有異動的白板）
--------------------------------------------------------------- */
type BoardCache = {
    snapshot: TLEditorSnapshot | null
    name: string
    forwardLinks: Map<string, string[]>
    backlinks: Map<string, BacklinkEntry[]>
    cards: CardTarget[]
}

function scanBoard(board: BoardRecord): Pick<BoardCache, 'forwardLinks' | 'backlinks' | 'cards'> {
    const forwardLinks = new Map<string, string[]>()
    const backlinks = new Map<string, BacklinkEntry[]>()
    const cards: CardTarget[] = []
    if (!board.snapshot) return { forwardLinks, backlinks, cards }

    const store = getSnapshotStore(board.snapshot)
    for (const shape of Object.values(store)) {
        if (shape.typeName !== 'shape' || shape.type !== 'card') continue
        const ptype = shape.props?.type
        if (ptype !== 'text' && ptype !== 'journal') continue
        const html = shape.props?.text ?? ''
        if (!html) continue

        // stripHtml 的成本幾乎全在 DOMParser，每張卡只做一次，
        // 名稱／連結／preview 共用同一份純文字。
        const text = stripHtml(html)

        // 卡片索引要收「每一張」卡——沒有 [[連結]] 的卡正是 B-LINK 要能跳到的目標，
        // 故必須在下方 links 的 early-return 之前收集。
        const name = cardNameFrom(html, text)
        if (name) {
            cards.push({
                boardId: board.id,
                boardName: board.name,
                shapeId: shape.id,
                name,
                x: shape.x ?? 0,
                y: shape.y ?? 0,
            })
        }

        const links = linksFromText(text)
        if (links.length === 0) continue

        forwardLinks.set(shape.id, links)
        const preview = text.slice(0, 80)
        for (const linkName of links) {
            const key = linkName.toLowerCase()
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
    return { forwardLinks, backlinks, cards }
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
        const { forwardLinks, backlinks, cards } = scanBoard(board)
        cacheRef.current.set(board.id, { snapshot: board.snapshot, name: board.name, forwardLinks, backlinks, cards })
    }

    // Merge all per-board caches into final Maps
    const mergedForward = new Map<string, string[]>()
    const mergedBack = new Map<string, BacklinkEntry[]>()
    const cardIndex = new Map<string, CardTarget[]>()
    for (const { forwardLinks, backlinks, cards } of cacheRef.current.values()) {
        for (const [k, v] of forwardLinks) mergedForward.set(k, v)
        for (const [k, vs] of backlinks) {
            const arr = mergedBack.get(k)
            if (arr) arr.push(...vs)
            else mergedBack.set(k, [...vs])
        }
        for (const c of cards) {
            const key = c.name.toLowerCase()
            const arr = cardIndex.get(key)
            if (arr) arr.push(c)
            else cardIndex.set(key, [c])
        }
    }

    resultRef.current = { forwardLinks: mergedForward, backlinks: mergedBack, cardIndex }
    return resultRef.current
}
