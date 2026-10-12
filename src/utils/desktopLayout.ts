// src/utils/desktopLayout.ts
//
// Scout Desktop 的卡片排列：順序＋哪些隱藏。只是 Desktop 自己的外觀偏好，不是白板資料，
// 存在 electron-store 的 desktopLayout（main process 只做格式檢查，見 desktopLayoutRules.js）。
//
// 卡片仍是固定幾張、寫死在 DesktopApp（ADR 0009 規則 5：不做 registry、不開放外掛），
// 這裡只決定「怎麼排」。純函式、零 runtime 依賴。

export type DesktopCardId = 'clock' | 'tasks' | 'recent-boards' | 'quick-note' | 'upcoming' | 'backup'

/** 預設順序（2 欄、由左而右、由上而下）。前四張＝ v1.5.0 的 2×2 */
export const DESKTOP_CARD_IDS: readonly DesktopCardId[] = ['clock', 'tasks', 'recent-boards', 'quick-note', 'upcoming', 'backup']

/** 不能隱藏：快速筆記是 Desktop 最主要的用途 */
export const REQUIRED_CARDS: readonly DesktopCardId[] = ['quick-note']

/** 新加的卡預設隱藏，畫面不會因為升級突然變樣（v0.1 的四張都預設顯示） */
const DEFAULT_HIDDEN: readonly DesktopCardId[] = ['upcoming', 'backup']

export const DESKTOP_COLUMNS = 2
/** ADR 0009：卡片上限 6 張 ⇒ 最多 3 列 */
export const DESKTOP_MAX_VISIBLE = 6

export interface DesktopLayout {
    version: 1
    /** 全部卡片的順序（含隱藏的），每張出現且只出現一次 */
    order: DesktopCardId[]
    hidden: DesktopCardId[]
}

export type MoveDirection = 'up' | 'down' | 'left' | 'right'

const isCardId = (v: unknown): v is DesktopCardId =>
    typeof v === 'string' && (DESKTOP_CARD_IDS as readonly string[]).includes(v)

export function defaultDesktopLayout(): DesktopLayout {
    return { version: 1, order: [...DESKTOP_CARD_IDS], hidden: [...DEFAULT_HIDDEN] }
}

/**
 * 任何東西 → 合法的排列。存檔壞掉、舊版存的、少了新卡、多了已移除的卡都在這裡收斂：
 * 不認得的丟掉、重複的只留第一個、缺的補到最後（新卡依 DEFAULT_HIDDEN 決定要不要藏）、
 * 必要卡一律顯示、顯示中的超過上限就把多的藏起來。
 */
export function normalizeDesktopLayout(raw: unknown): DesktopLayout {
    if (!raw || typeof raw !== 'object') return defaultDesktopLayout()
    const r = raw as { order?: unknown; hidden?: unknown }
    const rawOrder = Array.isArray(r.order) ? r.order : []
    const rawHidden = Array.isArray(r.hidden) ? r.hidden : []

    const order: DesktopCardId[] = []
    for (const id of rawOrder) if (isCardId(id) && !order.includes(id)) order.push(id)
    const hidden = new Set<DesktopCardId>(rawHidden.filter(isCardId))
    for (const id of DESKTOP_CARD_IDS) {
        if (order.includes(id)) continue
        order.push(id)
        if (DEFAULT_HIDDEN.includes(id)) hidden.add(id)
    }
    for (const id of REQUIRED_CARDS) hidden.delete(id)

    let visible = order.filter(id => !hidden.has(id))
    while (visible.length > DESKTOP_MAX_VISIBLE) {
        const drop = [...visible].reverse().find(id => !REQUIRED_CARDS.includes(id))
        if (!drop) break
        hidden.add(drop)
        visible = visible.filter(id => id !== drop)
    }
    return { version: 1, order, hidden: order.filter(id => hidden.has(id)) }
}

export function visibleDesktopCards(layout: DesktopLayout): DesktopCardId[] {
    return layout.order.filter(id => !layout.hidden.includes(id))
}

export function desktopRowCount(visibleCount: number): number {
    return Math.max(1, Math.ceil(Math.min(visibleCount, DESKTOP_MAX_VISIBLE) / DESKTOP_COLUMNS))
}

/** 交換兩張顯示中的卡（拖曳放下）。任一張不在畫面上就原樣回傳 */
export function swapDesktopCards(layout: DesktopLayout, a: DesktopCardId, b: DesktopCardId): DesktopLayout {
    if (a === b || layout.hidden.includes(a) || layout.hidden.includes(b)) return layout
    const order = [...layout.order]
    const i = order.indexOf(a)
    const j = order.indexOf(b)
    if (i < 0 || j < 0) return layout
    ;[order[i], order[j]] = [order[j], order[i]]
    return { ...layout, order }
}

/**
 * 方向鍵／箭頭按鈕：在「顯示中的格子」裡跟上下左右那一格交換。
 * 左右不跨列（左欄按 ← 不動）；最後一列只有一張（橫跨兩欄）時，按 ↓ 也會落到它身上。
 */
export function moveDesktopCard(layout: DesktopLayout, id: DesktopCardId, dir: MoveDirection): DesktopLayout {
    const target = desktopNeighbor(visibleDesktopCards(layout), id, dir)
    return target ? swapDesktopCards(layout, id, target) : layout
}

/** 某個方向有沒有鄰居（畫面用來決定箭頭按鈕要不要停用） */
export function desktopNeighbor(visible: DesktopCardId[], id: DesktopCardId, dir: MoveDirection): DesktopCardId | null {
    const n = visible.length
    const i = visible.indexOf(id)
    if (i < 0) return null
    const col = i % DESKTOP_COLUMNS
    const row = Math.floor(i / DESKTOP_COLUMNS)
    // 單數張時最後一張自己一列、橫跨兩欄（index 一定是偶數＝左欄）
    const spanning = n % DESKTOP_COLUMNS === 1 ? n - 1 : -1
    const lastRow = Math.floor((n - 1) / DESKTOP_COLUMNS)
    let j = -1
    switch (dir) {
        case 'left': if (col === 1) j = i - 1; break
        case 'right': if (col === 0 && i !== spanning) j = i + 1; break
        case 'up': j = i - DESKTOP_COLUMNS; break
        case 'down':
            j = i + DESKTOP_COLUMNS
            // 右欄往下、下一列只有橫跨的那張 ⇒ 也是它
            if (j >= n && spanning >= 0 && row + 1 === lastRow) j = spanning
            break
    }
    return j >= 0 && j < n ? visible[j] : null
}

export function canHideDesktopCard(layout: DesktopLayout, id: DesktopCardId): boolean {
    return !REQUIRED_CARDS.includes(id) && !layout.hidden.includes(id)
}

export function canShowDesktopCard(layout: DesktopLayout): boolean {
    return visibleDesktopCards(layout).length < DESKTOP_MAX_VISIBLE
}

export function hideDesktopCard(layout: DesktopLayout, id: DesktopCardId): DesktopLayout {
    if (!canHideDesktopCard(layout, id)) return layout
    return { ...layout, hidden: layout.order.filter(c => c === id || layout.hidden.includes(c)) }
}

/** 加回來的卡放到最後一格（使用者剛按了它，放在最後最好找） */
export function showDesktopCard(layout: DesktopLayout, id: DesktopCardId): DesktopLayout {
    if (!layout.hidden.includes(id) || !canShowDesktopCard(layout)) return layout
    return {
        version: 1,
        order: [...layout.order.filter(c => c !== id), id],
        hidden: layout.hidden.filter(c => c !== id),
    }
}

export function sameDesktopLayout(a: DesktopLayout, b: DesktopLayout): boolean {
    return a.order.join() === b.order.join() && a.hidden.join() === b.hidden.join()
}
