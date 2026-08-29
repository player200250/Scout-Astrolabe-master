// src/utils/orphanFiles.ts
//
// N10 收尾——本機孤兒實體檔的掃描（純函式層，不碰 IPC、不刪任何東西）。
//
// ── 為什麼會有孤兒 ──────────────────────────────────────────────────────
// TD-IMG 之後，image / file 卡的內容存成 `userData/files/` 裡的實體檔，snapshot 只留
// `props.storedName`。刪卡有走 `deleteStoredFile` 的路徑（垃圾桶過期清理），但不是每條
// 路徑都會走到——最明顯的是 M9 那個設計決策：**軟刪整塊白板時不逐一歸檔內部卡片**，
// 那塊板永久刪除後，板裡圖片卡的實體檔就沒有人再提起它了。檔案留在磁碟上，
// 不佔 IndexedDB、統計看不到、使用者也沒有任何入口能發現。
//
// ── 這裡的安全前提（比「省空間」重要得多）──────────────────────────────
// 刪錯＝使用者的圖永久消失，所以判定孤兒的標準刻意保守：
//   1. **所有可能提到它的地方都要掃**——現存白板（含垃圾桶裡的，還能還原）、
//      垃圾桶裡的單卡、白板模板，以及**自動備份**（還原舊備份時那些卡會回來，
//      圖沒了就是還原出一堆破圖）。漏掃任何一項都會誤刪。
//   2. **太新的檔一律跳過**：圖片是「先存檔 → 再更新 snapshot → 才自動存檔進 DB」，
//      中間有時間差；掃描剛好卡在中間就會把使用者三秒前貼的圖判成孤兒。
//   3. 掃描與刪除分兩步，中間要人按下去（UI 負責）。
import type { BoardRecord, BackupRecord, BoardTemplateRecord, DeletedCardRecord } from '../db'
import type { TLEditorSnapshot } from 'tldraw'
import { getSnapshotStore } from './snapshot'
import type { StoredFileInfo } from '../platform/fileStore'

/** 新於這個歲數的檔案一律不刪（見上方安全前提 2）。 */
export const MIN_ORPHAN_AGE_MS = 24 * 60 * 60 * 1000   // 24 小時

export interface ReferenceSources {
    boards: BoardRecord[]
    deletedCards: DeletedCardRecord[]
    templates: BoardTemplateRecord[]
    backups: BackupRecord[]
}

/** 從一份 snapshot 收集所有卡片的 storedName。 */
function collectFromSnapshot(snapshot: TLEditorSnapshot | null, out: Set<string>): void {
    if (!snapshot) return
    for (const rec of Object.values(getSnapshotStore(snapshot))) {
        if (rec?.typeName !== 'shape' || rec.type !== 'card') continue
        const name = rec.props?.storedName
        if (typeof name === 'string' && name) out.add(name)
    }
}

/**
 * 掃出「還有人提到」的所有 storedName。
 * 刻意不區分來源——只要任何一處提到就不是孤兒，沒有「這個來源比較不重要」這種事。
 */
export function collectReferencedStoredNames(sources: ReferenceSources): Set<string> {
    const out = new Set<string>()

    for (const b of sources.boards) collectFromSnapshot(b.snapshot, out)
    for (const t of sources.templates) collectFromSnapshot(t.snapshot, out)

    // 備份裡是整包白板陣列，逐塊往下挖
    for (const bk of sources.backups) {
        for (const b of bk.boards ?? []) collectFromSnapshot(b.snapshot, out)
    }

    // 垃圾桶的單卡存的是「一個 shape 物件」，不是 snapshot
    for (const c of sources.deletedCards) {
        const props = (c.shapeData as { props?: { storedName?: unknown } } | null)?.props
        if (typeof props?.storedName === 'string' && props.storedName) out.add(props.storedName)
    }

    return out
}

export interface OrphanFilePlan {
    /** 可以刪的檔（沒人提到、而且夠舊） */
    orphans: StoredFileInfo[]
    /** 這些檔加起來的位元組 */
    bytes: number
    /** 掃過的檔案總數 */
    scanned: number
    /** 沒人提到、但因為太新而暫不處理的檔數（顯示用，讓數字對得起來） */
    skippedTooNew: number
}

/**
 * 比對「磁碟上有什麼」與「還有人提到什麼」，產出刪除計畫。純函式：不刪檔、不碰 IPC。
 * `now` 與 `minAgeMs` 由呼叫端傳入，測試才能不靠真實時鐘。
 */
export function planOrphanFiles(
    files: StoredFileInfo[],
    referenced: Set<string>,
    now: number,
    minAgeMs: number = MIN_ORPHAN_AGE_MS,
): OrphanFilePlan {
    const orphans: StoredFileInfo[] = []
    let skippedTooNew = 0

    for (const f of files) {
        if (referenced.has(f.name)) continue
        if (now - f.mtimeMs < minAgeMs) { skippedTooNew++; continue }
        orphans.push(f)
    }

    return {
        orphans,
        bytes: orphans.reduce((sum, f) => sum + f.size, 0),
        scanned: files.length,
        skippedTooNew,
    }
}
