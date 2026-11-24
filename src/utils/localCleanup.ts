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

/**
 * 讀出「還有人提到」的所有 storedName（白板含垃圾桶裡的、垃圾桶單卡、模板、自動備份）。
 * `scanOrphanFiles` 與 `releaseStoredFiles` 共用——兩條刪檔路徑用同一份判定，不各寫一套。
 */
async function loadReferencedStoredNames(): Promise<Set<string>> {
    const [boards, deletedCards, templates, backups] = await Promise.all([
        db.table('boards').toArray() as Promise<BoardRecord[]>,
        db.table('deletedCards').toArray().catch(() => []) as Promise<DeletedCardRecord[]>,
        db.table('boardTemplates').toArray().catch(() => []) as Promise<BoardTemplateRecord[]>,
        db.table('backups').toArray().catch(() => []) as Promise<BackupRecord[]>,
    ])
    return collectReferencedStoredNames({ boards, deletedCards, templates, backups })
}

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
        const [files, referenced] = await Promise.all([listStoredFiles(), loadReferencedStoredNames()])
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

export interface ReleaseResult {
    /** 已經沒有任何引用、所以刪掉的檔 */
    deleted: string[]
    /** 還有別處引用（複製出來的卡、垃圾桶、模板、備份）、所以保留的檔 */
    kept: string[]
}

/**
 * 某張卡**已經從資料庫移除**之後，釋放它的實體檔：只有在全 vault 都沒人再提到時才刪。
 *
 * ⚠️ 呼叫順序很重要：一定要先把那張卡的記錄（垃圾桶單卡）刪掉再呼叫，
 * 否則它自己就是一個引用，檔案永遠刪不掉（安全側的失敗，但會留下孤兒）。
 *
 * 為什麼需要：複製卡片（Ctrl+D、複製貼上）時 tldraw 原樣複製 props，兩張卡共用同一個
 * storedName。以前永久刪除會無條件刪檔，另一張卡就變成破圖（P0 審查 D1）。
 *
 * 讀不到資料庫時**一律不刪**——判斷不出來就當作還有人在用，最壞只是留下孤兒檔，
 * 資料安全中心的「清理孤兒檔」之後還能收。
 */
export async function releaseStoredFiles(storedNames: Iterable<string>): Promise<ReleaseResult> {
    const names = [...new Set([...storedNames].filter(n => typeof n === 'string' && n))]
    if (names.length === 0) return { deleted: [], kept: [] }
    let referenced: Set<string>
    try {
        referenced = await loadReferencedStoredNames()
    } catch (err) {
        console.error('[cleanup] 讀取引用失敗，這次不刪任何實體檔', err)
        return { deleted: [], kept: names }
    }
    const deleted: string[] = []
    const kept: string[] = []
    for (const name of names) {
        if (referenced.has(name)) { kept.push(name); continue }
        deleteStoredFile(name)
        deleted.push(name)
    }
    return { deleted, kept }
}

/** 從垃圾桶單卡記錄取出實體檔名（圖片卡、檔案卡才有）。 */
export function storedNameOfTrashedCard(record: DeletedCardRecord): string | null {
    if (record.type !== 'file' && record.type !== 'image') return null
    const name = (record.shapeData as { props?: { storedName?: unknown } } | null)?.props?.storedName
    return typeof name === 'string' && name ? name : null
}
