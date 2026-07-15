// src/utils/cardLinks.ts
//
// `[[名稱]]` 的解析與補全候選（純函式，便於單元測試）。
//
// B-LINK（2026-07-15）：在此之前 `[[X]]` 只在 X 是白板名時才跳得動，指向卡片的連結
// 點下去完全沒反應（WhiteboardTools 的 targetName 分支只比對白板清單就 return）。
// 解析順序「白板優先、再卡片」沿用 knowledgeGraph.ts 既有行為，避免同一個 `[[X]]`
// 在圖譜與跳轉兩處指到不同東西。
import type { CardTarget } from '../hooks/useBacklinks'

export interface BoardNameRef {
    id: string
    name: string
}

export type LinkResolution =
    | { kind: 'board'; boardId: string }
    | { kind: 'card'; target: CardTarget }

/**
 * 解析 `[[name]]` 指向何處。白板優先、再卡片；都找不到回 null（連結是死的）。
 * 撞名時取第一張，與 `knowledgeGraph.ts` 的 `cardByName.get(tl)?.[0]` 一致。
 */
export function resolveLinkTarget(
    name: string,
    boards: BoardNameRef[],
    cardIndex: Map<string, CardTarget[]>,
): LinkResolution | null {
    const key = name.trim().toLowerCase()
    if (!key) return null

    const board = boards.find(b => b.name.toLowerCase() === key)
    if (board) return { kind: 'board', boardId: board.id }

    const card = cardIndex.get(key)?.[0]
    return card ? { kind: 'card', target: card } : null
}

/* ================================================
   補全候選
================================================ */
export type LinkTargetKind = 'board' | 'card'

export interface LinkTarget {
    name: string
    kind: LinkTargetKind
}

/**
 * 補全清單：白板名在前、卡片名在後。
 * 卡片名與白板名重複時只留白板（因為 `[[X]]` 解析時白板優先，留著卡片會誤導）。
 */
export function buildLinkTargets(boardNames: string[], cardNames: string[]): LinkTarget[] {
    const seen = new Set<string>()
    const out: LinkTarget[] = []
    for (const name of boardNames) {
        const key = name.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ name, kind: 'board' })
    }
    for (const name of cardNames) {
        const key = name.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ name, kind: 'card' })
    }
    return out
}

/** 每組各自的顯示上限 */
export interface LinkTargetLimits {
    board?: number
    card?: number
}

/**
 * 依 query 過濾（不分大小寫的子字串比對），白板優先的順序由 buildLinkTargets 決定。
 *
 * **配額是分組各自算的，不是共用一個總額**：白板名通常是組織性的（技術債／產品重設計）、
 * 數量又固定成長，共用總額時會把卡片擠光——實測 7 個白板就吃掉 8 格總額，
 * 打 `[[` 只看得到白板、一張卡片名都出不來。
 */
export function filterLinkTargets(
    targets: LinkTarget[],
    query: string,
    limits: LinkTargetLimits = {},
): LinkTarget[] {
    const max = { board: limits.board ?? 5, card: limits.card ?? 8 }
    const used = { board: 0, card: 0 }
    const q = query.toLowerCase()
    const out: LinkTarget[] = []
    for (const t of targets) {
        if (used[t.kind] >= max[t.kind]) continue
        if (!t.name.toLowerCase().includes(q)) continue
        used[t.kind]++
        out.push(t)
    }
    return out
}

/** 分組顯示用（比照 `/` 選單的 groupSlashCommands） */
export function groupLinkTargets(targets: LinkTarget[]): { group: string; items: LinkTarget[] }[] {
    const boards = targets.filter(t => t.kind === 'board')
    const cards = targets.filter(t => t.kind === 'card')
    const out: { group: string; items: LinkTarget[] }[] = []
    if (boards.length) out.push({ group: '白板', items: boards })
    if (cards.length) out.push({ group: '卡片', items: cards })
    return out
}
