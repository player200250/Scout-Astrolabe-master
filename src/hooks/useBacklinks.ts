// src/hooks/useBacklinks.ts
import { useMemo, createContext } from 'react'
import type { TLEditorSnapshot } from 'tldraw'

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
   主 Hook
--------------------------------------------------------------- */
export function useBacklinks(boards: BoardRecord[]): Omit<BacklinksContextValue, 'boardNames'> {
    return useMemo(() => {
        const forwardLinks = new Map<string, string[]>()
        const backlinks = new Map<string, BacklinkEntry[]>()

        for (const board of boards) {
            if (!board.snapshot) continue
            const store = (board.snapshot as any).document?.store ?? {}

            for (const shape of Object.values(store) as any[]) {
                if (shape.typeName !== 'shape' || shape.type !== 'card') continue
                const ptype: string = shape.props?.type
                if (ptype !== 'text' && ptype !== 'journal') continue
                const html: string = shape.props?.text || ''
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
        }

        return { forwardLinks, backlinks }
    }, [boards])
}
