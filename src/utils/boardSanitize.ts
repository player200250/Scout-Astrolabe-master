import type { TLEditorSnapshot } from 'tldraw'
import type { BoardRecord } from '../db'
import { saveBoard } from './boardDb'
import {
    getSnapshotStore, withUpdatedStore,
    sanitizeSnapshot, sanitizeCardProps,
} from './snapshot'

/**
 * 移除指向「已刪除白板」的孤兒 board-card（連結卡）。
 * 回傳新 snapshot；若無孤兒則原樣回傳（reference 不變，方便呼叫端跳過寫入）。
 */
export function cleanupOrphanBoardCards(snapshot: TLEditorSnapshot, deletedBoardId: string): TLEditorSnapshot {
    const store = getSnapshotStore(snapshot)
    const orphanIds = Object.keys(store).filter(sid => {
        const s = store[sid]
        return s.typeName === 'shape' && s.type === 'card' && s.props?.type === 'board' && s.props?.linkedBoardId === deletedBoardId
    })
    if (orphanIds.length === 0) return snapshot
    const newStore = { ...store }
    orphanIds.forEach(sid => { delete newStore[sid] })
    return withUpdatedStore(snapshot, newStore)
}

/**
 * 啟動時資料修復：補齊 document/page 缺漏欄位、修正卡片 props。
 * 只有實際變動的白板會寫回 DB；其餘原樣回傳。
 */
export async function sanitizeBoards(boards: BoardRecord[]): Promise<BoardRecord[]> {
    const out: BoardRecord[] = []
    for (const board of boards) {
        if (!board.snapshot) { out.push(board); continue }

        // Fix document:document and page records missing required fields
        let snapshot = sanitizeSnapshot(board.snapshot)
        let dirty = JSON.stringify(snapshot) !== JSON.stringify(board.snapshot)

        const store = getSnapshotStore(snapshot)
        const newStore = { ...store }
        for (const record of Object.values(store)) {
            if (record.typeName !== 'shape' || record.type !== 'card' || !record.props) continue
            const fixed = sanitizeCardProps(record.props)
            if (fixed !== record.props) {
                newStore[record.id] = { ...record, props: fixed }
                dirty = true
            }
        }
        if (dirty) {
            snapshot = withUpdatedStore(snapshot, newStore)
            const updated = { ...board, snapshot }
            await saveBoard(updated)
            out.push(updated)
        } else {
            out.push(board)
        }
    }
    return out
}
