// src/utils/localCleanup.ts
//
// N10 收尾——本機孤兒實體檔的「掃描 → 刪除」兩步流程（有副作用的那一層）。
// 判定邏輯全在純函式 `utils/orphanFiles.ts`，這裡只負責把資料湊齊、真的去刪。
//
// 介面刻意對齊 `sync/cloudCleanup.ts`（scanXxx / cleanupXxx + ok/error 回傳），
// 兩者在資料安全中心並排呈現，行為模式一致使用者才不用學兩套。
import { db } from '../db'
import type { BoardRecord, BackupRecord, BoardTemplateRecord, DeletedCardRecord } from '../db'
import { canListStoredFiles, listStoredFiles, deleteStoredFile } from '../platform/fileStore'
import { collectReferencedStoredNames, planOrphanFiles, type OrphanFilePlan } from './orphanFiles'

export interface LocalScanResult {
    ok: boolean
    error?: string
    plan?: OrphanFilePlan
}

/**
 * 掃描本機孤兒實體檔。**不刪任何東西。**
 *
 * ⚠️ `boards` 讀的是整張表、不濾掉 `deletedAt`——垃圾桶裡的白板還能還原，
 * 它裡面的圖當然不算孤兒。這是最容易寫錯、而且錯了會靜靜刪掉使用者資料的一行。
 */
export async function scanOrphanFiles(now: number = Date.now()): Promise<LocalScanResult> {
    if (!canListStoredFiles()) {
        return { ok: false, error: '這個環境不支援實體檔清理（需要桌面版）' }
    }
    try {
        const [files, boards, deletedCards, templates, backups] = await Promise.all([
            listStoredFiles(),
            db.table('boards').toArray() as Promise<BoardRecord[]>,
            db.table('deletedCards').toArray().catch(() => []) as Promise<DeletedCardRecord[]>,
            db.table('boardTemplates').toArray().catch(() => []) as Promise<BoardTemplateRecord[]>,
            db.table('backups').toArray().catch(() => []) as Promise<BackupRecord[]>,
        ])
        const referenced = collectReferencedStoredNames({ boards, deletedCards, templates, backups })
        return { ok: true, plan: planOrphanFiles(files, referenced, now) }
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : '掃描失敗' }
    }
}

export interface LocalCleanupResult {
    ok: boolean
    error?: string
    deletedFiles: number
    freedBytes: number
}

/**
 * 依照掃描結果刪檔。只刪 plan 裡列出的那些——**不重新判定**，
 * 使用者按下按鈕時同意的是他看到的那份清單。
 */
export async function cleanupOrphanFiles(plan: OrphanFilePlan): Promise<LocalCleanupResult> {
    if (!canListStoredFiles()) {
        return { ok: false, error: '這個環境不支援實體檔清理（需要桌面版）', deletedFiles: 0, freedBytes: 0 }
    }
    let deletedFiles = 0
    let freedBytes = 0
    for (const f of plan.orphans) {
        try {
            deleteStoredFile(f.name)
            deletedFiles++
            freedBytes += f.size
        } catch (err) {
            console.error('[cleanup] 刪除孤兒檔失敗', f.name, err)
        }
    }
    return { ok: true, deletedFiles, freedBytes }
}
