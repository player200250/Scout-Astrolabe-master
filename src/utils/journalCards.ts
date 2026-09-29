// src/utils/journalCards.ts
//
// 日記／週回顧卡的查找。兩者是同一種卡（props.type === 'journal'），
// 差別只在 props.journalDate 的格式：日記是 '2026-09-20'，週回顧是 'week-2026-38'。
//
// 原本這段私有在 JournalDayView 裡，週回顧分頁要讀同一批卡時只能複製一份 —— 抽出來共用。

import type { BoardRecord } from '../db'
import { getSnapshotStore } from './snapshot'
import { stripHtml } from './stringUtils'

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

/**
 * 這份內容是不是「還沒被動過」——與模板一字不差。
 *
 * RC9 的守門用：自動存檔是 900ms debounce，而它存的是**「900ms 之後」的文件狀態**，
 * 不是觸發當下。使用者打了字又在同一個視窗內刪掉，時間到時文件已經變回模板，
 * 於是憑空生出一張「只有標題、一個字沒填」的空殼卡（實測確認，見 bugs.md RC9）。
 *
 * 比的是**去標籤後的文字**而不是原始 HTML：容得下屬性與空白的差異。
 * 代價是「只改格式、一個字都沒加」的內容會被視為未動過——卡片還不存在時那種編輯
 * 本來就看不出差別（編輯器顯示的就是模板），所以不存也不會少掉任何東西。
 */
export function isUntouchedTemplate(html: string | undefined | null, template: string): boolean {
    return stripHtml(html ?? '').trim() === stripHtml(template ?? '').trim()
}
