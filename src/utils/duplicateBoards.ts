// src/utils/duplicateBoards.ts
//
// BoardOverview 的「🧹 清理重複」判斷邏輯。
//
// 原本內嵌在 onClick 裡，有三個問題（都會讓它對真實資料失效或造成過度刪除）：
//
// 1. 用**完整名稱**分組，但重複白板天生就不同名——`uniqueName()` 會補「 (2)」「 (3)」。
//    D1 主頁畫布搬遷產生的 `主頁白板` / `主頁白板 (2)` / `主頁白板 (3)` 因此永遠分不到同一組，
//    這個功能對它「為之而生」的案例其實是 no-op。改成比對去掉序號後的**基底名**。
// 2. 一組全空時 `empties` ＝整組，會把最後一塊也刪掉，一份都不留。改成必定保留一塊。
// 3. `!b.snapshot` 判空會漏掉「有 snapshot 但畫布上 0 個 shape」的板（建了沒用就放著的）。
//    改成實際數 shape。
//
// 一律只刪「空的」板；有內容的重複板要留給人自己判斷，不是清理工具該決定的事。

import type { BoardRecord } from '../db'
import { getSnapshotStore } from './snapshot'

/** 名稱尾端的 `uniqueName()` 序號，例如 `技術債 (3)` → 3；沒有序號視為 1。 */
function suffixNumber(name: string): number {
    const m = /\s*\((\d+)\)\s*$/.exec(name)
    return m ? Number(m[1]) : 1
}

/** 去掉尾端的「 (N)」序號，取得基底名。`主頁白板 (2)` → `主頁白板`。 */
export function baseBoardName(name: string): string {
    return name.replace(/\s*\(\d+\)\s*$/, '').trim()
}

/** 白板畫布上是否有任何 shape（不限卡片——筆刷、框線、箭頭都算內容）。 */
export function boardHasContent(board: BoardRecord): boolean {
    if (!board.snapshot) return false
    return Object.values(getSnapshotStore(board.snapshot)).some(r => r.typeName === 'shape')
}

/**
 * 找出可安全清理的重複白板：同基底名、且畫布是空的。
 *
 * 保護規則（順序即優先度）：
 * - 主頁／收件匣／資料夾不參與（資料夾天生沒有 snapshot，會被誤判成空）
 * - 已在垃圾桶的（`deletedAt`）不重複計算
 * - 有內容的一律不刪
 * - 有子白板指著它的不刪（刪了會讓子板失去父節點）
 * - 每組**至少保留一塊**；整組都空時保留序號最小的那塊（即「本尊」）
 */
export function findDuplicateBoards(boards: BoardRecord[]): BoardRecord[] {
    const hasChildren = new Set(
        boards.map(b => b.parentId).filter((id): id is string => !!id)
    )

    const candidates = boards.filter(b =>
        !b.isHome && !b.isInbox && !b.isFolder && !b.deletedAt
    )

    const groups = new Map<string, BoardRecord[]>()
    for (const board of candidates) {
        const key = baseBoardName(board.name)
        const group = groups.get(key)
        if (group) group.push(board)
        else groups.set(key, [board])
    }

    const removable: BoardRecord[] = []
    for (const group of groups.values()) {
        if (group.length <= 1) continue

        const empties = group
            .filter(b => !boardHasContent(b) && !hasChildren.has(b.id))
            .sort((a, b) => suffixNumber(a.name) - suffixNumber(b.name))
        if (empties.length === 0) continue

        // 整組都是可刪的空板 → 留下序號最小的本尊，其餘才刪
        const keepOne = empties.length === group.length
        removable.push(...(keepOne ? empties.slice(1) : empties))
    }
    return removable
}
