// src/hooks/useOverdueStats.ts
//
// TD1 步驟 2 — 從 App.tsx 抽出「逾期 / 今天到期」的統計。
// 計算本身是純函式（`countDueTodos`），hook 只負責掛 useMemo：
// 這樣測試不必進 jsdom，直接餵白板陣列驗數字即可。
//
// 只數 todo 卡的待辦項；已勾選或沒有 dueDate 的一律略過。
// 日期比較用字串直接比大小——`getTodayStr()` 與 `dueDate` 都是 `YYYY-MM-DD`，
// 這種格式的字典序等同時間序，不需要轉 Date（也就不會踩到時區）。
import { useMemo } from 'react'
import type { BoardRecord } from '../db'
import { getCardShapes } from '../utils/snapshot'
import { getTodayStr } from '../utils/date'

export interface OverdueStats {
    /** 到期日早於今天、尚未完成 */
    overdueCount: number
    /** 到期日就是今天、尚未完成 */
    todayCount: number
}

export function countDueTodos(boards: BoardRecord[], todayStr: string): OverdueStats {
    let overdueCount = 0
    let todayCount = 0
    for (const board of boards) {
        for (const shape of getCardShapes(board.snapshot)) {
            if (shape.props.type !== 'todo') continue
            for (const t of shape.props.todos ?? []) {
                if (t.checked || !t.dueDate) continue
                if (t.dueDate < todayStr) overdueCount++
                else if (t.dueDate === todayStr) todayCount++
            }
        }
    }
    return { overdueCount, todayCount }
}

export function useOverdueStats(boards: BoardRecord[]): OverdueStats {
    return useMemo(() => countDueTodos(boards, getTodayStr()), [boards])
}
