// src/utils/homeBoardMigration.ts
//
// D1：主頁改為「永遠是儀表板」，不再有儀表板／白板雙模式。
//
// 主頁（home_board）過去同時是一張真白板，內容存在自己的 snapshot 裡。
// 拿掉雙模式後那份 snapshot 就沒有 UI 打得開了——資料還在 IndexedDB、還會被備份複製，
// 但使用者永遠看不到。所以載入時偵測到主頁畫布還有東西，就整份搬成一張普通白板。
//
// 只搬不刪：主頁 snapshot 清空前，內容已完整複製到新白板。
// 搬「整份 snapshot」而非只挑卡片——主頁上可能有筆刷、框線、箭頭，只挑卡片會漏。

import type { BoardRecord } from '../db'
import { getSnapshotStore } from './snapshot'

/** 承接舊主頁畫布的白板預設名（撞名時由 uniqueName 加序號） */
export const MIGRATED_HOME_BOARD_NAME = '主頁白板'

/** 主頁畫布是否還有內容（任何 shape，不限卡片）。 */
export function homeBoardHasContent(homeBoard: BoardRecord | undefined | null): boolean {
    if (!homeBoard?.snapshot) return false
    const store = getSnapshotStore(homeBoard.snapshot)
    return Object.values(store).some(r => r.typeName === 'shape')
}

export interface HomeBoardMigration {
    /** 承接舊主頁畫布內容的新白板 */
    migratedBoard: BoardRecord
    /** snapshot／thumbnail 清空後的主頁 */
    clearedHome: BoardRecord
}

/**
 * 算出主頁畫布的搬遷結果；主頁沒有內容時回傳 null（不做任何事）。
 * 不 mutate 傳入值；實際寫 DB 由呼叫端負責。
 *
 * @param newId       新白板 id（由呼叫端提供，保持本函式純粹）
 * @param uniqueName  依既有白板名算出不撞名的名稱
 */
export function buildHomeBoardMigration(
    homeBoard: BoardRecord | undefined | null,
    newId: string,
    uniqueName: (base: string) => string,
    now: number = Date.now(),
): HomeBoardMigration | null {
    if (!homeBoard || !homeBoardHasContent(homeBoard)) return null

    const migratedBoard: BoardRecord = {
        id: newId,
        name: uniqueName(MIGRATED_HOME_BOARD_NAME),
        snapshot: homeBoard.snapshot,
        thumbnail: homeBoard.thumbnail,
        updatedAt: now,
    }

    // 主頁保留 record 當導覽錨點（整個 App 假設「當前位置＝一個 boardId」），只清空畫布內容
    const clearedHome: BoardRecord = {
        ...homeBoard,
        snapshot: null,
        thumbnail: null,
    }

    return { migratedBoard, clearedHome }
}
