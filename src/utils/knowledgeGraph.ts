// src/utils/knowledgeGraph.ts
//
// 知識圖譜的節點/連結建構（純函式，與 React / react-force-graph 解耦，便於單元測試）。
//
// A6 Bundle A（2026-07-06）：與 App 其他部分對齊 wikilink 解析。
//   - 卡片命名走 extractCardName（優先 H1/H2 標題，否則前 40 字），與
//     useBacklinks / BacklinksPanel / [[]] 實際跳轉一致 → 圖上連線目標不再對不上。
//   - wikilink 連結來源改用 useBacklinks 的增量快取 forwardLinks（已 stripHtml + 去重），
//     不在此重新解析原始 HTML → 消除 TD4（全量重掃）/ TD5（分歧 stripHtml）/
//     A4（行內標籤 CJK 空格）病灶再現，並順帶把原本「每板掃兩遍」收斂為單遍。
import type { BoardRecord } from '../db'
import { getCardShapes } from './snapshot'
import { extractCardName } from '../hooks/useBacklinks'

export interface GraphNode {
    id: string
    name: string
    type: 'card' | 'board'
    boardId: string
    boardName: string
    color: string
    val: number
}

export interface GraphLink {
    source: string
    target: string
    type: 'wikilink' | 'parent'
}

function hsl(idx: number, total: number, l: number): string {
    const h = Math.round((idx / Math.max(total, 1)) * 360)
    return `hsl(${h},65%,${l}%)`
}

/**
 * LOD（Level of Detail）：依 react-force-graph 的 `globalScale`（縮放層級，
 * 1 為預設、< 1 為縮小、> 1 為放大）決定是否繪製節點標籤。
 * 縮小看全局時隱藏標籤，避免文字重疊、省下繪製。
 *   - 白板：較重要，縮到 0.6 以上就顯示。
 *   - 卡片：只在放大（> 1.2）且連結度較高（val ≥ 3）時顯示。
 */
export function shouldShowNodeLabel(
    type: GraphNode['type'],
    val: number,
    globalScale: number,
): boolean {
    return type === 'board'
        ? globalScale > 0.6
        : val >= 3 && globalScale > 1.2
}

/**
 * 建立知識圖譜資料。
 *
 * @param boards        白板清單（含 snapshot 與 parentId）。
 * @param forwardLinks  useBacklinks 產出的 `shapeId → [[名稱]] 清單`（已 stripHtml + 去重）。
 */
export function buildGraph(
    boards: BoardRecord[],
    forwardLinks: Map<string, string[]>,
): { nodes: GraphNode[]; links: GraphLink[] } {
    const total = boards.length
    const colorIdx = new Map<string, number>()
    boards.forEach((b, i) => colorIdx.set(b.id, i))

    const nodes: GraphNode[] = []
    const links: GraphLink[] = []
    const refCount = new Map<string, number>()

    const boardByName = new Map<string, string>()
    boards.forEach(b => boardByName.set(b.name.toLowerCase(), b.id))
    const cardByName = new Map<string, string[]>()

    // 單遍：建立卡片節點（text / journal），命名走 extractCardName（與全 App 一致）
    for (const board of boards) {
        const ci = colorIdx.get(board.id) ?? 0
        for (const shape of getCardShapes(board.snapshot)) {
            if (shape.props.type !== 'text' && shape.props.type !== 'journal') continue
            const name = extractCardName(shape.props.text ?? '') ?? '(empty)'
            nodes.push({ id: shape.id, name, type: 'card', boardId: board.id, boardName: board.name, color: hsl(ci, total, 60), val: 1 })
            const key = name.toLowerCase()
            const existing = cardByName.get(key)
            if (existing) existing.push(shape.id)
            else cardByName.set(key, [shape.id])
            refCount.set(shape.id, 0)
        }
    }

    // 白板節點
    for (const board of boards) {
        const ci = colorIdx.get(board.id) ?? 0
        nodes.push({ id: board.id, name: board.name, type: 'board', boardId: board.id, boardName: board.name, color: hsl(ci, total, 44), val: 5 })
        refCount.set(board.id, 0)
    }

    // 父子白板連結
    for (const board of boards) {
        if (board.parentId && boards.find(b => b.id === board.parentId)) {
            links.push({ source: board.parentId, target: board.id, type: 'parent' })
        }
    }

    // wikilink 連結：直接取 forwardLinks（不重新解析 HTML）
    for (const node of nodes) {
        if (node.type !== 'card') continue
        const names = forwardLinks.get(node.id)
        if (!names) continue
        for (const t of names) {
            const tl = t.toLowerCase()
            const targetId = boardByName.get(tl) ?? cardByName.get(tl)?.[0] ?? null
            if (targetId && targetId !== node.id) {
                links.push({ source: node.id, target: targetId, type: 'wikilink' })
                refCount.set(targetId, (refCount.get(targetId) ?? 0) + 1)
            }
        }
    }

    for (const node of nodes) {
        const rc = refCount.get(node.id) ?? 0
        node.val = node.type === 'board' ? 5 + rc : 1 + rc
    }

    return { nodes, links }
}
