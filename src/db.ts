// src/db.ts — 共用 Dexie 實例，App.tsx 和 BackupPanel.tsx 都從此匯入
import Dexie from 'dexie'
import type { TLEditorSnapshot } from 'tldraw'
import { getBackupLimit } from './utils/backupSettings'

export interface BoardRecord {
    id: string
    name: string
    snapshot: TLEditorSnapshot | null
    thumbnail: string | null
    updatedAt: number
    parentId?: string | null
    isHome?: boolean
    isJournal?: boolean
    isInbox?: boolean
    status?: 'active' | 'archived' | 'pinned'
    lastVisitedAt?: number
    sortOrder?: number
    deletedAt?: number
    folderId?: string | null
    isFolder?: boolean
}

export interface DeletedCardRecord {
    id: string
    shapeId: string
    boardId: string
    boardName: string
    shapeData: unknown
    deletedAt: number
    type: string
    preview: string
}

export interface BackupRecord {
    id: string
    timestamp: number
    boardCount: number
    boards: BoardRecord[]
}

export interface TemplateRecord {
    id: string
    name: string
    content: string
    createdAt: number
}

/** N19：整塊白板存成的模板（snapshot 級，非單一文字卡）。可從此一鍵新建白板。 */
export interface BoardTemplateRecord {
    id: string
    name: string
    snapshot: TLEditorSnapshot | null
    thumbnail: string | null
    createdAt: number
}

export const db = new Dexie('AstrolabeDB')
db.version(1).stores({ snapshots: 'id' })
db.version(2).stores({ snapshots: 'id', boards: 'id' })
db.version(3).stores({ snapshots: 'id', boards: 'id', backups: 'id' })
db.version(4).stores({ snapshots: 'id', boards: 'id', backups: 'id, timestamp' })
db.version(5).stores({ snapshots: 'id', boards: 'id', backups: 'id, timestamp', templates: 'id, createdAt' })
db.version(6).stores({ snapshots: 'id', boards: 'id, deletedAt', backups: 'id, timestamp', templates: 'id, createdAt', deletedCards: 'id, deletedAt, boardId' })
db.version(7)
    .stores({ snapshots: 'id', boards: 'id, deletedAt', backups: 'id, timestamp', templates: 'id, createdAt', deletedCards: 'id, deletedAt, boardId, shapeId' })
    .upgrade(tx => tx.table('deletedCards').toCollection().modify(record => {
        if (!('shapeId' in record)) record.shapeId = ''
    }))
db.version(8).stores({ snapshots: 'id', boards: 'id, deletedAt, folderId', backups: 'id, timestamp', templates: 'id, createdAt', deletedCards: 'id, deletedAt, boardId, shapeId' })
// v9：N19 白板模板（整塊 snapshot 存為可複用模板）
db.version(9).stores({ snapshots: 'id', boards: 'id, deletedAt, folderId', backups: 'id, timestamp', templates: 'id, createdAt', deletedCards: 'id, deletedAt, boardId, shapeId', boardTemplates: 'id, createdAt' })

// 每份備份都是「全部白板的完整 snapshot（含 base64 圖片）」的複製。
// 原本保留 30 份 → 一個含圖片的 vault 會被複製 30 次，輕易把 IndexedDB 撐到數 GB、
// 並在備份寫入時造成記憶體尖峰導致 renderer OOM。降到 5 份。
// N17 起改為可設定（預設仍是 5，上限 20），設定在 utils/backupSettings.ts。

/** 刪除超過保留份數的舊備份。只比對 timestamp 鍵、不載入 blob，記憶體成本低。 */
export async function trimBackups(): Promise<number> {
    const limit = getBackupLimit()
    const keys = await db.table('backups').orderBy('timestamp').primaryKeys()
    if (keys.length <= limit) return 0
    const toDelete = keys.slice(0, keys.length - limit)
    await db.table('backups').bulkDelete(toDelete)
    return toDelete.length
}

export async function saveAutoBackup(boards: BoardRecord[]): Promise<void> {
    const now = Date.now()
    const record: BackupRecord = { id: `backup_${now}`, timestamp: now, boardCount: boards.length, boards }
    await db.table('backups').put(record)
    await trimBackups()
}

export async function loadBackups(): Promise<BackupRecord[]> {
    return db.table('backups').orderBy('timestamp').reverse().toArray()
}

export async function deleteBackup(id: string): Promise<void> {
    return db.table('backups').delete(id)
}

// ── 白板模板（N19）──────────────────────────────────────────────
// snapshot 直接沿用 board 的（Dexie put 會序列化隔離；載入建板時 WhiteboardTools 會 sanitize）。
// 與匯出/匯入 JSON 同語意：不重生 shape id、不動 board 卡連結。

/** 把一塊白板存成模板。name 省略時預設「<板名> 模板」。 */
export async function saveBoardAsTemplate(board: BoardRecord, name?: string): Promise<void> {
    const record: BoardTemplateRecord = {
        id: `btmpl_${Date.now()}`,
        name: name?.trim() || `${board.name} 模板`,
        snapshot: board.snapshot,
        thumbnail: board.thumbnail,
        createdAt: Date.now(),
    }
    await db.table('boardTemplates').put(record)
}

export async function loadBoardTemplates(): Promise<BoardTemplateRecord[]> {
    return db.table('boardTemplates').orderBy('createdAt').reverse().toArray()
}

export async function deleteBoardTemplate(id: string): Promise<void> {
    return db.table('boardTemplates').delete(id)
}

export async function renameBoardTemplate(id: string, name: string): Promise<void> {
    await db.table('boardTemplates').update(id, { name })
}
