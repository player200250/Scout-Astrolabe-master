// src/platform/backupFile.ts
//
// 硬碟備份的 renderer 端薄接縫：把整份 vault 組成 JSON 交給主程序寫進「文件\Scout Astrolabe 備份」。
// 節流（約每小時一份）、剩餘空間檢查、保留規則都在主程序（main.js 的 write-backup-file），
// 這裡只負責「要寫什麼」。網頁版（PWA）沒有 electronAPI ⇒ 什麼都不做。
//
// 為什麼要有這層：2026-10-05 事故時，App 內建的自動備份跟白板在同一個 IndexedDB，資料庫被刪就一起沒了。

import { db, type BackupRecord, type BoardRecord } from '../db'
import { getCardShapes } from '../utils/snapshot'

/** 組出要寫進檔案的內容（純函式，可測）。沒有任何卡片時回 null——空資料不寫，免得把好備份擠掉。 */
export function buildDiskBackup(boards: BoardRecord[], now: number = Date.now()): { json: string; imageNames: string[] } | null {
    const cardCount = boards
        .filter(b => !b.deletedAt)
        .reduce((sum, b) => sum + getCardShapes(b.snapshot).length, 0)
    if (cardCount === 0) return null

    const imageNames = new Set<string>()
    for (const b of boards) {
        for (const shape of getCardShapes(b.snapshot)) {
            const name = shape.props.type === 'image' ? shape.props.storedName : null
            if (typeof name === 'string' && name) imageNames.add(name)
        }
    }

    // 與 App 內備份同一個格式（BackupRecord），之後「從檔案還原」可以直接走現有的還原流程。
    // 縮圖不帶：它是 base64、常常比內容本身還大，而且會自動重建。
    const record: BackupRecord = {
        id: `file_${now}`,
        timestamp: now,
        boardCount: boards.length,
        boards: boards.map(b => ({ ...b, thumbnail: null })),
    }
    return { json: JSON.stringify(record), imageNames: [...imageNames] }
}

export type ParsedDiskBackup =
    | { ok: true; boards: BoardRecord[]; timestamp: number | null; cardCount: number }
    | { ok: false; error: string }

/**
 * 解析備份檔（純函式，可測）。接受 App 自己寫的 BackupRecord 格式。
 *
 * ⚠️ updatedAt 一律推進到 `now`：備份裡的時間比雲端舊，若沿用，還原後同步引擎會判成
 * 「雲端較新」把剛還原的內容又拉回去蓋掉——2026-10-05 那種雲端被清空的情況就等於白還原。
 */
export function parseDiskBackup(json: string, now: number = Date.now()): ParsedDiskBackup {
    let data: unknown
    try { data = JSON.parse(json) } catch { return { ok: false, error: '這個檔案不是有效的 JSON。' } }
    const rec = data as Partial<BackupRecord> | null
    if (!rec || !Array.isArray(rec.boards)) return { ok: false, error: '這不是 Scout Astrolabe 的備份檔（找不到白板清單）。' }
    const boards = rec.boards.filter((b): b is BoardRecord =>
        !!b && typeof b === 'object' && typeof (b as BoardRecord).id === 'string' && typeof (b as BoardRecord).name === 'string')
    if (boards.length === 0) return { ok: false, error: '備份檔裡沒有任何白板。' }
    const cardCount = boards.filter(b => !b.deletedAt).reduce((s, b) => s + getCardShapes(b.snapshot ?? null).length, 0)
    return {
        ok: true,
        boards: boards.map(b => ({ ...b, updatedAt: now })),
        timestamp: typeof rec.timestamp === 'number' ? rec.timestamp : null,
        cardCount,
    }
}

export const canUseDiskBackup = (): boolean => !!window.electronAPI?.getBackupStatus

export async function getDiskBackupStatus() {
    return window.electronAPI?.getBackupStatus?.() ?? null
}

export async function openDiskBackupDir(): Promise<void> {
    await window.electronAPI?.openBackupDir?.()
}

/** 選檔＋解析；取消回 null */
export async function pickDiskBackup(): Promise<(ParsedDiskBackup & { fileName: string; imagesRestored: number }) | null> {
    const picked = await window.electronAPI?.pickBackupFile?.()
    if (!picked) return null
    return { ...parseDiskBackup(picked.json), fileName: picked.name, imagesRestored: picked.imagesRestored }
}

/**
 * 寫一份硬碟備份。內容**直接從資料庫讀**，不用呼叫端傳來的 React state：
 * state 裡的白板清單不含垃圾桶，而「從檔案還原」會先清空資料庫——只備份 state 的話，
 * 沒開雲端同步時還原一次，垃圾桶裡的白板就永久消失了（2026-10-05 實測發現）。
 */
export async function writeDiskBackup(): Promise<void> {
    const api = window.electronAPI
    if (!api?.writeBackupFile) return
    const boards: BoardRecord[] = await db.table('boards').toArray()
    const payload = buildDiskBackup(boards)
    if (!payload) return
    const res = await api.writeBackupFile(payload.json, payload.imageNames)
    if (!res.written && res.reason !== 'throttled') console.warn('[backup] 硬碟備份沒寫成：', res.reason)
}
