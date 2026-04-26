import { db } from '../db'
import type { BoardRecord } from '../db'
import { HOME_BOARD_ID, INBOX_BOARD_ID } from '../constants'

export const generateId = () => `board_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

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
