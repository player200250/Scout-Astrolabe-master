// src/utils/desktopSummary.ts
//
// Scout Desktop（第二個視窗）與主視窗之間的契約，以及摘要的計算。
//
// 邊界（見 docs/adr/0009-scout-desktop-scope.md）：主視窗是唯一的資料來源與寫入者。
// Desktop 不碰 Dexie、不碰 snapshot，只收這份小摘要、送下面這幾種指令回主視窗。
// 所以這裡只能放「主視窗算得出來、Desktop 看得懂」的東西——縮圖、卡片 HTML、日記內容都不放。
//
// 本檔零 runtime 依賴（只有 import type 與純函式），Desktop 端只 import type。

import type { BoardRecord } from '../db'
import { getCardShapes } from './snapshot'
import { findJournalCard } from './journalCards'

/** 摘要裡最多帶幾筆待辦（畫面只顯示 5 筆，其餘算進「還有 N 項」） */
export const DESKTOP_TASK_LIMIT = 20
export const DESKTOP_RECENT_LIMIT = 5
/** 快速筆記長度上限：main process 也會擋一次 */
export const DESKTOP_NOTE_MAX = 5000

export interface DesktopTaskItem {
    boardName: string
    text: string
    dueDate: string
    isOverdue: boolean
}

export interface DesktopSummary {
    version: 1
    generatedAt: number
    /** 主視窗計算時的「今天」；和 Desktop 自己的日期不同時，Desktop 要送 refresh 請主視窗重算 */
    today: string
    tasks: {
        overdueCount: number
        todayCount: number
        /** 逾期在前、同組內依到期日；最多 DESKTOP_TASK_LIMIT 筆 */
        items: DesktopTaskItem[]
    }
    recentBoards: { id: string; name: string; lastVisitedAt: number }[]
    journal: { hasEntryToday: boolean }
    inbox: { count: number }
}

/** Desktop → 主視窗的指令。白名單以外一律拒絕（main process 驗一次、主視窗再驗一次） */
export type DesktopCommand =
    | { type: 'open-board'; boardId: string }
    | { type: 'open-task-center' }
    | { type: 'open-journal' }
    | { type: 'quick-capture'; text: string }
    | { type: 'refresh' }

export type DesktopCommandResult = { ok: true } | { ok: false; reason: 'not-ready' | 'invalid' }

export function buildDesktopSummary(boards: BoardRecord[], today: string, now: number): DesktopSummary {
    let overdueCount = 0
    let todayCount = 0
    const items: DesktopTaskItem[] = []
    // 跟側邊欄徽章（countDueTodos）同一個範圍：所有白板都算，數字才對得上
    for (const board of boards) {
        if (board.deletedAt) continue
        for (const shape of getCardShapes(board.snapshot)) {
            if (shape.props.type !== 'todo') continue
            for (const t of shape.props.todos ?? []) {
                if (t.checked || !t.dueDate || t.dueDate > today) continue
                const isOverdue = t.dueDate < today
                if (isOverdue) overdueCount++
                else todayCount++
                items.push({ boardName: board.name, text: t.text, dueDate: t.dueDate, isOverdue })
            }
        }
    }
    items.sort((a, b) => a.dueDate.localeCompare(b.dueDate))

    const recentBoards = boards
        .filter(b => !b.deletedAt && !b.isHome && !b.isInbox && !b.isJournal && !b.isFolder && b.lastVisitedAt)
        .sort((a, b) => (b.lastVisitedAt ?? 0) - (a.lastVisitedAt ?? 0))
        .slice(0, DESKTOP_RECENT_LIMIT)
        .map(b => ({ id: b.id, name: b.name, lastVisitedAt: b.lastVisitedAt ?? 0 }))

    const inboxBoard = boards.find(b => b.isInbox && !b.deletedAt)

    return {
        version: 1,
        generatedAt: now,
        today,
        tasks: { overdueCount, todayCount, items: items.slice(0, DESKTOP_TASK_LIMIT) },
        recentBoards,
        // 所有 Journal 白板都找（Dashboard 只看第一塊，是已知的不一致）
        journal: { hasEntryToday: findJournalCard(boards, today) !== null },
        inbox: { count: inboxBoard ? getCardShapes(inboxBoard.snapshot).length : 0 },
    }
}

/**
 * 兩份摘要是否「畫面上看起來一樣」——一樣就不必送 IPC。
 * generatedAt 每次都不同，不列入比較。
 */
export function sameDesktopSummary(a: DesktopSummary | null, b: DesktopSummary | null): boolean {
    if (!a || !b) return a === b
    return JSON.stringify({ ...a, generatedAt: 0 }) === JSON.stringify({ ...b, generatedAt: 0 })
}
