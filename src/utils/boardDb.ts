import { db } from '../db'
import type { BoardRecord } from '../db'
import { HOME_BOARD_ID, INBOX_BOARD_ID } from '../constants'
import { EXAMPLE_SEED_FLAG } from './exampleBoard'
import { buildHomeBoardMigration } from './homeBoardMigration'

export const generateId = () => `board_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

/**
 * 在現有白板名稱中產生不重複名稱（base、base (2)、base (3)…）。純函式。
 * 原本在 useBoardCRUD，但 loadAllBoards 的主頁畫布搬遷也要用；
 * 從資料層 import hook 會與 useBoardCRUD → boardDb 形成循環，故移到這裡。
 */
export function uniqueName(base: string, currentBoards: BoardRecord[]): string {
    const existing = new Set(currentBoards.map(b => b.name))
    if (!existing.has(base)) return base
    let n = 2
    while (existing.has(`${base} (${n})`)) n++
    return `${base} (${n})`
}

export const isRasterThumbnail = (t: string | null | undefined): t is string =>
    typeof t === 'string' && (
        t.startsWith('data:image/png;base64,') ||
        t.startsWith('data:image/jpeg;base64,') ||
        t.startsWith('data:image/webp;base64,')
    )

export const saveBoard = async (board: BoardRecord) => { await db.table('boards').put(board) }
export const deleteBoard = async (id: string) => { await db.table('boards').delete(id) }

export const loadAllBoards = async (): Promise<BoardRecord[]> => {
    const boards = await db.table('boards').toArray()

    const svgBoards = boards.filter(b => !isRasterThumbnail(b.thumbnail) && b.thumbnail != null)
    if (svgBoards.length > 0) {
        await Promise.all(svgBoards.map(b => db.table('boards').put({ ...b, thumbnail: null })))
        svgBoards.forEach(b => { b.thumbnail = null })
    }

    let homeBoard = boards.find(b => b.isHome)
    if (!homeBoard) {
        homeBoard = {
            id: HOME_BOARD_ID,
            name: '🏠 主頁',
            snapshot: null,
            thumbnail: null,
            updatedAt: 0,
            isHome: true,
        }
        await db.table('boards').put(homeBoard)
        boards.unshift(homeBoard)
    }

    // D1：主頁不再有白板模式。舊主頁畫布若還有內容，整份搬成一張普通白板，
    // 否則那些 shape 會留在 DB 裡但沒有任何 UI 打得開（見 homeBoardMigration.ts）。
    const migration = buildHomeBoardMigration(
        homeBoard,
        generateId(),
        base => uniqueName(base, boards),
    )
    if (migration) {
        await db.table('boards').put(migration.migratedBoard)
        await db.table('boards').put(migration.clearedHome)
        const homeIdx = boards.findIndex(b => b.id === migration.clearedHome.id)
        if (homeIdx >= 0) boards[homeIdx] = migration.clearedHome
        boards.push(migration.migratedBoard)
        console.log(`[home] 主頁畫布已搬成「${migration.migratedBoard.name}」`)
    }

    let inboxBoard = boards.find(b => b.isInbox)
    if (!inboxBoard) {
        inboxBoard = {
            id: INBOX_BOARD_ID,
            name: '📥 收件匣',
            snapshot: null,
            thumbnail: null,
            updatedAt: 0,
            isInbox: true,
        }
        await db.table('boards').put(inboxBoard)
        boards.push(inboxBoard)
    }

    if (boards.filter(b => !b.isHome && !b.isInbox).length === 0) {
        const oldSnapshot = await db.table('snapshots').get('latest')
        const firstBoard: BoardRecord = {
            id: generateId(),
            name: '我的白板',
            snapshot: oldSnapshot?.snapshot ?? null,
            thumbnail: null,
            updatedAt: Date.now(),
        }
        await db.table('boards').put(firstBoard)
        boards.push(firstBoard)

        // 全新使用者（沒有可沿用的舊 snapshot）：標記這塊為待 seed 範例卡。
        // 實際建卡由 WhiteboardTools 掛載時走 editor.createShape 完成（見 exampleBoard.ts）。
        // 從舊版遷移（有 oldSnapshot）者不標記，避免覆蓋既有內容。
        if (!oldSnapshot?.snapshot) {
            try { localStorage.setItem(EXAMPLE_SEED_FLAG, firstBoard.id) } catch { /* localStorage 不可用時略過 */ }
        }
    }

    const home  = boards.filter(b => b.isHome)
    const inbox = boards.filter(b => b.isInbox)
    const rest  = boards.filter(b => !b.isHome && !b.isInbox).sort((a, b) => {
        if (a.sortOrder != null && b.sortOrder != null) return a.sortOrder - b.sortOrder
        if (a.sortOrder != null) return -1
        if (b.sortOrder != null) return 1
        return a.updatedAt - b.updatedAt
    })
    return [...home, ...inbox, ...rest]
}
