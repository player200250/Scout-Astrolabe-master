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

/**
 * 跳轉目的地落在日誌板時，改去復盤中心的哪一頁（RC17 方案 D）。
 *
 * 日誌板只當倉庫、側邊欄看不到（方案 A），但卡片庫、搜尋、任務中心、`[[連結]]` 這些
 * 「跳到卡片」的路徑原本會照常切板 ⇒ 把人送進一塊隱藏的畫布，回不去也看不懂。
 */
export type ReviewTarget =
    | { tab: 'journal'; date: Date }
    | { tab: 'weekly'; date: Date }
    | { tab: 'calendar' }

/**
 * 目的地不在日誌板 ⇒ null（照常跳轉）。
 * 在日誌板：日記卡（'2026-09-20'）→ 日記頁那一天；週回顧（'week-2026-38'）→ 週回顧那一週；
 * 其他卡（或只指定白板）→ 月曆。日誌板上「當天計畫」待辦卡也帶 journalDate，一樣落在那一天。
 */
export function reviewTargetFor(boards: BoardRecord[], boardId: string | undefined, shapeId?: string): ReviewTarget | null {
    const board = boardId ? boards.find(b => b.id === boardId) : undefined
    if (!board?.isJournal) return null
    const key = shapeId && board.snapshot
        ? getSnapshotStore(board.snapshot)[shapeId]?.props?.journalDate as string | null | undefined
        : null
    const day = key?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (day) return { tab: 'journal', date: new Date(+day[1], +day[2] - 1, +day[3]) }
    const week = key?.match(/^week-(\d{4})-(\d{2})$/)
    if (week) return { tab: 'weekly', date: isoWeekMonday(+week[1], +week[2]) }
    return { tab: 'calendar' }
}

/** ISO 週次的週一（本地時間）。1/4 必定落在第 1 週 */
function isoWeekMonday(year: number, week: number): Date {
    const jan4 = new Date(year, 0, 4)
    const monday = new Date(year, 0, 4 - ((jan4.getDay() || 7) - 1))
    monday.setDate(monday.getDate() + (week - 1) * 7)
    return monday
}
