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
