// src/utils/journalCards.ts
//
// 日記／週回顧卡的查找。兩者是同一種卡（props.type === 'journal'），
// 差別只在 props.journalDate 的格式：日記是 '2026-09-20'，週回顧是 'week-2026-38'。
//
// 原本這段私有在 JournalDayView 裡，週回顧分頁要讀同一批卡時只能複製一份 —— 抽出來共用。

import type { BoardRecord } from '../db'
import { getSnapshotStore } from './snapshot'

export interface JournalCardRef {
    boardId: string
    shapeId: string
    text: string
}

/**
 * 在所有 Journal 白板裡找 journalDate 等於 key 的那張卡。
 * 找不到回 null（呼叫端自行決定要不要用模板開新的一張）。
 */
export function findJournalCard(boards: BoardRecord[], key: string): JournalCardRef | null {
    for (const board of boards) {
        if (!board.isJournal || !board.snapshot) continue
        const store = getSnapshotStore(board.snapshot)
        for (const shape of Object.values(store)) {
            if (
                shape.typeName === 'shape' && shape.type === 'card' &&
                shape.props?.type === 'journal' && shape.props?.journalDate === key
            ) {
                return { boardId: board.id, shapeId: shape.id, text: shape.props.text ?? '' }
            }
        }
    }
    return null
}
