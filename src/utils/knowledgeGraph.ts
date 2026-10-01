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
    /** quest＝標了 #主線／#支線 的待辦卡（2026-09-30）：圖譜的起點，一律顯示名稱與下一步 */
    type: 'card' | 'board' | 'quest'
    boardId: string
    boardName: string
    color: string
    val: number
    quest?: 'main' | 'side'
    /** quest 的下一步（最早到期的未完成項；都沒日期就取第一個未完成項），全部完成則為 null */
    nextStep?: string | null
    /** quest 的待辦原始資料：點節點時的進度面板用（2026-10-01） */
    todos?: TodoLike[]
}

export type TodoLike = { id?: string; text?: string; checked?: boolean; dueDate?: string | null }

/** 2026-09-20 依使用者指示把逾期項「標記並勾掉」時加的前綴：勾起來了，但不算完成 */
export const FAILED_PREFIX = '❌ 失敗｜'

export interface QuestItem {
    key: string
    text: string
    dueDate: string | null
    status: 'open' | 'done' | 'failed'
    overdue: boolean
    isNext: boolean
}

/**
 * 主線／支線進度面板的資料。失敗項（勾起來＋FAILED_PREFIX）另外計數，不灌進完成率。
 * 「下一步」與 pickNextStep 同一規則（最早到期的未完成項；都沒日期取第一個），圖上標籤與面板才不會打架。
 * 排序：未完成照清單順序在前，完成／失敗沉到底。
 */
export function questProgress(todos: TodoLike[] | undefined, today: string): {
    done: number; failed: number; total: number; items: QuestItem[]
} {
    const items: QuestItem[] = (todos ?? [])
        .filter(t => (t.text ?? '').trim())
        .map((t, i) => {
            const raw = (t.text ?? '').trim()
            const failed = !!t.checked && raw.startsWith(FAILED_PREFIX)
            const status: QuestItem['status'] = failed ? 'failed' : t.checked ? 'done' : 'open'
            return {
                key: t.id ?? String(i),
                text: failed ? raw.slice(FAILED_PREFIX.length).trim() : raw,
                dueDate: t.dueDate || null,
                status,
                overdue: status === 'open' && !!t.dueDate && t.dueDate < today,
                isNext: false,
            }
        })
    const open = items.filter(x => x.status === 'open')
    const next = [...open].sort((a, b) => (a.dueDate || '9999-99-99') < (b.dueDate || '9999-99-99') ? -1
        : (a.dueDate || '9999-99-99') > (b.dueDate || '9999-99-99') ? 1 : 0)[0]
    if (next) next.isNext = true
    return {
        done: items.filter(x => x.status === 'done').length,
        failed: items.filter(x => x.status === 'failed').length,
        total: items.length,
        items: [...open, ...items.filter(x => x.status !== 'open')],
    }
}

/**
 * 待辦卡的「下一步」：未完成項裡**到期日最早**的那一個；沒有任何日期就取清單順序的第一個。
 * 附上「（M/D）」讓人一眼知道急不急。全部完成回 null。
 */
export function pickNextStep(todos: TodoLike[] | undefined): string | null {
    const open = (todos ?? []).map((t, i) => ({ t, i })).filter(x => !x.t.checked && (x.t.text ?? '').trim())
    if (open.length === 0) return null
    open.sort((a, b) => {
        const da = a.t.dueDate || '9999-99-99', db = b.t.dueDate || '9999-99-99'
        return da === db ? a.i - b.i : da < db ? -1 : 1
    })
    const { t } = open[0]
    const due = t.dueDate ? `（${Number(t.dueDate.slice(5, 7))}/${Number(t.dueDate.slice(8, 10))}）` : ''
    return `${(t.text ?? '').trim()}${due}`
}

/**
 * 主線／支線節點上顯示的短標題：卡片標題常帶裝飾與補充說明，例如
 * 「🎯 主線：求職（Spine 動畫師）· 主角＝…」「🎯 MVP 里程碑 〔8/06 起凍結〕」。
 * 去掉開頭的 emoji／符號、「主線：」「支線：」前綴（節點本身已標示），並在「·」「〔」「｜」處截斷。
 */
export function questTitle(name: string): string {
    const t = name
        .replace(/^[^\p{L}\p{N}]+/u, '')      // 開頭的 emoji／符號／空白
        .replace(/^(主線|支線)\s*[：:]\s*/, '')
        .split(/\s*[·〔｜|]\s*/)[0]
        .trim()
    return t || name.trim()
}

/**
 * 截斷「下一步」但保留結尾的（M/D）：日期是判斷急不急的關鍵，先被切掉的必須是描述。
 */
export function shortenKeepDue(s: string, max: number): string {
    if (s.length <= max) return s
    const m = s.match(/（\d{1,2}\/\d{1,2}）$/)
    const due = m ? m[0] : ''
    const body = due ? s.slice(0, -due.length) : s
    return body.slice(0, Math.max(1, max - due.length - 1)) + '…' + due
}

/**
 * 不畫進圖譜的白板：主頁／收件匣／資料夾不是「白板」，日誌板只當日記的倉庫（2026-09-30）。
 * 它們原本各佔一個節點（29 個裡佔 8 個），點日誌板或日記卡還會跳進那塊隱藏的畫布。
 */
function isGraphBoard(b: BoardRecord): boolean {
    return !b.isHome && !b.isInbox && !b.isFolder && !b.isJournal
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
    // 門檻 2026-09-30 下修：原本白板要 > 0.6、卡片要 > 1.2，自動框完全部節點時 globalScale 常在 0.3 上下，
    // 結果一打開整張圖沒有任何字（使用者：「看不清楚」）。主線／支線一律顯示——它們就是起點。
    // 白板也一律嘗試顯示：縮放門檻原本是為了避免文字互疊，現在 KnowledgeGraph 的 drawLabels
    // 會依重要性排序、放不下就略過，重疊已由程式保證，門檻只剩「一縮小就全部沒字」的副作用。
    // 卡片仍保留門檻：60 多張卡同時搶位，只會讓重要的白板名被擠掉。
    if (type === 'quest' || type === 'board') return true
    return val >= 2 && globalScale > 0.5
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
    boards = boards.filter(isGraphBoard)
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

    // 主線／支線：放在白板節點**之後**＝最後才畫，標籤不會被所屬白板的方塊壓住（canvas 依陣列順序繪製）。
    // 標了 #主線 或 #支線 的待辦卡。連到所屬白板（parent 連線），不會被「只顯示有連結」濾掉
    for (const board of boards) {
        for (const shape of getCardShapes(board.snapshot)) {
            if (shape.props.type !== 'todo') continue
            const tags: string[] = shape.props.tags ?? []
            const quest = tags.includes('主線') ? 'main' : tags.includes('支線') ? 'side' : null
            if (!quest) continue
            nodes.push({
                id: shape.id, name: (shape.props.text ?? '').trim() || '(未命名)', type: 'quest',
                boardId: board.id, boardName: board.name,
                color: quest === 'main' ? '#f97316' : '#a78bfa',
                val: quest === 'main' ? 20 : 10,
                quest, nextStep: pickNextStep(shape.props.todos), todos: shape.props.todos,
            })
            links.push({ source: board.id, target: shape.id, type: 'parent' })
        }
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
        if (node.type === 'quest') continue // 大小固定，不隨引用數變
        node.val = node.type === 'board' ? 5 + rc : 1 + rc
    }

    return { nodes, links }
}
