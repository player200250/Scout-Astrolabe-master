import type { TLSnapshotStore } from './snapshot'

/**
 * tldraw snapshot store 的卡片附加樣板。
 * 原本散在 useBoardManager 的 4 個 handler（saveJournal / addCardToInbox /
 * moveCardToBoard / softDeleteWithInboxMove）裡逐字重複，抽成純函式以消重複。
 */

/**
 * 確保 store 內有 document:document 與一筆 page 記錄，回傳 pageId。
 * 會 mutate 傳入的 store（與原行為一致）。
 */
export function ensurePageScaffold(store: TLSnapshotStore): string {
    if (!store['document:document']) {
        store['document:document'] = { typeName: 'document', id: 'document:document', gridSize: 10, name: '', meta: {} }
    }
    const pageRecord = Object.values(store).find(r => r.typeName === 'page')
    const pageId = pageRecord?.id ?? 'page:page'
    if (!store[pageId]) {
        store[pageId] = { typeName: 'page', id: pageId, name: '', index: 'a1', meta: {} }
    }
    return pageId
}

/**
 * 新卡片附加時的 X 座標：最右側 shape 的右緣 +40；無 shape 時為 100。
 */
export function nextAppendX(store: TLSnapshotStore): number {
    const existingShapes = Object.values(store).filter(r => r.typeName === 'shape')
    return existingShapes.length > 0
        ? Math.max(...existingShapes.map(s => (s.x ?? 0) + (s.props?.w ?? 240))) + 40
        : 100
}

/**
 * 目前最大的 shape fractional index 基底（不含結尾 'V'）；無 shape 時為 'a0'。
 * 呼叫端自行 `+ 'V'` 取得新 index，以保與原邏輯逐字一致。
 */
export function lastShapeIndex(store: TLSnapshotStore): string {
    const existingIndices = Object.values(store)
        .filter(r => r.typeName === 'shape')
        .map(r => r.index)
        .filter((idx): idx is string => idx !== undefined)
        .sort()
    return existingIndices[existingIndices.length - 1] ?? 'a0'
}

/** 網格排列預設：卡片尺寸與格距（與新建卡片預設 240×180 一致） */
const DEFAULT_CARD_W = 240
const DEFAULT_CARD_H = 180
const GRID_GAP = 40

export interface CardDims { w: number; h: number }
export interface GridPos { x: number; y: number }

/**
 * 將一批卡片以近正方形網格排列（欄數 = ceil(√n)），回傳每張的左上座標。
 * 以 (startX, startY) 為整批左上錨點；欄步/列步取批次中最大卡片尺寸 + gap，確保不重疊。
 * 取代原本「y 固定、x 逐張右移」的長龍排列（D6，批次搬卡）。
 */
export function gridLayout(cards: CardDims[], startX: number, startY: number, gap = GRID_GAP): GridPos[] {
    const n = cards.length
    if (n === 0) return []
    const cols = Math.ceil(Math.sqrt(n))
    const colStep = Math.max(...cards.map(c => c.w)) + gap
    const rowStep = Math.max(...cards.map(c => c.h)) + gap
    return cards.map((_, i) => ({
        x: startX + (i % cols) * colStep,
        y: startY + Math.floor(i / cols) * rowStep,
    }))
}

/**
 * 收件匣單張快速捕捉卡的下一個網格槽位：以現有 shape 數量決定落點，固定 cols 欄、
 * 錨點 (startX, startY)、格距 cellW×cellH。取代原本「一路往右 append」導致的超長橫列（D6，快速捕捉）。
 */
export function nextGridSlot(
    store: TLSnapshotStore,
    cols = 5,
    cellW = DEFAULT_CARD_W + GRID_GAP,
    cellH = DEFAULT_CARD_H + GRID_GAP,
    startX = 100,
    startY = 100,
): GridPos {
    const count = Object.values(store).filter(r => r.typeName === 'shape').length
    return {
        x: startX + (count % cols) * cellW,
        y: startY + Math.floor(count / cols) * cellH,
    }
}
