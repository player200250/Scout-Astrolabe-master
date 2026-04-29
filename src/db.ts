// src/db.ts — 共用 Dexie 實例，App.tsx 和 BackupPanel.tsx 都從此匯入
import Dexie from 'dexie'
import type { TLEditorSnapshot } from 'tldraw'

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

export const db = new Dexie('AstrolabeDB')
db.version(1).stores({ snapshots: 'id' })
db.version(2).stores({ snapshots: 'id', boards: 'id' })
db.version(3).stores({ snapshots: 'id', boards: 'id', backups: 'id' })
db.version(4).stores({ snapshots: 'id', boards: 'id', backups: 'id, timestamp' })
db.version(5).stores({ snapshots: 'id', boards: 'id', backups: 'id, timestamp', templates: 'id, createdAt' })

export const MAX_BACKUPS = 30

export async function saveAutoBackup(boards: BoardRecord[]): Promise<void> {
    const now = Date.now()
    const record: BackupRecord = { id: `backup_${now}`, timestamp: now, boardCount: boards.length, boards }
    await db.table('backups').put(record)
    const all: BackupRecord[] = await db.table('backups').orderBy('timestamp').toArray()
    if (all.length > MAX_BACKUPS) {
        const toDelete = all.slice(0, all.length - MAX_BACKUPS)
        await Promise.all(toDelete.map(b => db.table('backups').delete(b.id)))
    }
}

export async function loadBackups(): Promise<BackupRecord[]> {
    return db.table('backups').orderBy('timestamp').reverse().toArray()
}

export async function deleteBackup(id: string): Promise<void> {
    return db.table('backups').delete(id)
}
