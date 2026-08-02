// src/utils/snapshotMerge.ts
//
// 卡片級三方合併（roadmap-mobile：整板 LWW → 卡片級）。
//
// ── 為什麼需要這個 ─────────────────────────────────────────────────────────
// 同步的單位是整塊白板的 tldraw snapshot。兩台裝置各改了**同一塊板的不同卡片**時，
// 舊行為是整塊覆蓋——而且實測下來連 LWW 都不是：`pushBoard` 是無條件 upsert，
// 又排在拉取之前，所以**先同步的那一台直接蓋掉另一台**，不管誰改得比較晚。
// 沒有錯誤、沒有提示，另一台的卡片就是不見了。
//
// ── 為什麼是「三方」而不是「比誰新」──────────────────────────────────────
// 只比兩邊的話，永遠分不出「這張卡是 A 刪掉的」還是「這張卡是 B 新增的」——
// 兩種情況下的資料長得一模一樣（一邊有、一邊沒有）。要分辨就必須知道**上一次
// 同步時是什麼樣子**，也就是共同祖先（base）。
//
// ── base 只存雜湊，不存整份 snapshot ──────────────────────────────────────
// base 的用途只有一個：回答「這一邊有沒有動過這張卡」。那只需要比對指紋，
// 不需要原內容——真要取內容時，local 或 remote 本來就在手上。
// 所以 base 存成 `Record<shapeId, hash>`，一塊板約幾百 bytes，可以安心放在
// syncState（localStorage）裡；存整份 snapshot 則是好幾 MB，不可能。
import type { TLEditorSnapshot } from 'tldraw'
import { getSnapshotStore, withUpdatedStore, type TLSnapshotStore, type TLSnapshotStoreRecord } from './snapshot'

/** 一塊板的 base 指紋：shapeId → 內容雜湊 */
export type ShapeHashes = Record<string, string>

/**
 * 內容指紋（djb2）。與 syncState.hashThumbnail 同一套理由：只需要回答
 * 「跟上次一不一樣」，不需要抗碰撞，選它是因為夠快又不必引依賴。
 *
 * ⚠️ 用 `JSON.stringify` 的**鍵順序**當輸入是有風險的——同樣的資料，鍵順序不同
 * 就會算出不同指紋。這裡可以接受，因為兩邊比的是「同一個 tldraw 版本寫出來的
 * 同一筆記錄」，順序穩定；就算誤判成「有改」，最壞結果也只是多套用一次相同內容。
 * （`decideSync` 當年不逐欄比 snapshot 就是為了避開這個問題，但那裡是拿來決定
 * 要不要整塊同步，誤判的代價大得多。）
 */
export function hashRecord(record: unknown): string {
    const text = JSON.stringify(record) ?? ''
    let h = 5381
    for (let i = 0; i < text.length; i++) {
        h = ((h * 33) ^ text.charCodeAt(i)) >>> 0
    }
    return `${text.length}:${h.toString(36)}`
}

/**
 * 算出 snapshot 裡**每個 shape** 的指紋。
 * 只收 shape：page/document/instance 那些記錄不是使用者內容，合併時一律用本機的
 * （見 mergeSnapshots 的說明）。
 */
export function hashSnapshotShapes(snapshot: TLEditorSnapshot | null): ShapeHashes {
    if (!snapshot) return {}
    const out: ShapeHashes = {}
    for (const [id, rec] of Object.entries(getSnapshotStore(snapshot))) {
        if (rec?.typeName !== 'shape') continue
        out[id] = hashRecord(rec)
    }
    return out
}

export interface MergeStats {
    /** 遠端新增、本機沒有的 shape */
    added: number
    /** 採用遠端版本（只有遠端改過） */
    updated: number
    /** 依另一端的刪除而移除 */
    removed: number
    /** 兩邊都改了同一張卡，只能挑一邊 */
    conflicts: number
}

export interface MergeResult {
    snapshot: TLEditorSnapshot
    stats: MergeStats
    /** 有沒有真的動到東西（沒動的話呼叫端可以省掉一次寫入） */
    changed: boolean
}

export interface MergeOptions {
    /**
     * 兩邊都改了同一張卡時要採用哪一邊。
     * 這是整個合併裡**唯一會丟資料的地方**，所以刻意做成呼叫端明講的參數，
     * 而不是藏在裡面預設一個。syncEngine 傳的是「板的 updatedAt 誰比較新」。
     */
    preferRemoteOnConflict: boolean
}

/**
 * 三方合併兩份 snapshot。
 *
 * 非 shape 的記錄（document / page / instance / camera…）一律用 **local**：
 * 它們是檢視狀態與頁面骨架，不是使用者內容；拿遠端的來蓋只會把本機的
 * 捲動位置、縮放之類的東西換掉，沒有任何好處。
 */
export function mergeSnapshots(
    base: ShapeHashes,
    local: TLEditorSnapshot | null,
    remote: TLEditorSnapshot | null,
    options: MergeOptions,
): MergeResult {
    const stats: MergeStats = { added: 0, updated: 0, removed: 0, conflicts: 0 }

    // 任一邊沒有 snapshot 就沒得合併——直接用另一邊（都沒有就回 local）
    if (!local || !remote) {
        return { snapshot: (local ?? remote) as TLEditorSnapshot, stats, changed: false }
    }

    const localStore = getSnapshotStore(local)
    const remoteStore = getSnapshotStore(remote)

    const merged: TLSnapshotStore = {}
    // 先鋪上本機的非 shape 記錄（頁面骨架、檢視狀態）
    for (const [id, rec] of Object.entries(localStore)) {
        if (rec?.typeName !== 'shape') merged[id] = rec
    }
    // 遠端獨有的非 shape 記錄也要補（例如另一台新建了一個 page）
    for (const [id, rec] of Object.entries(remoteStore)) {
        if (rec?.typeName !== 'shape' && !(id in merged)) merged[id] = rec
    }

    const shapeIds = new Set<string>()
    for (const [id, rec] of Object.entries(localStore)) if (rec?.typeName === 'shape') shapeIds.add(id)
    for (const [id, rec] of Object.entries(remoteStore)) if (rec?.typeName === 'shape') shapeIds.add(id)
    for (const id of Object.keys(base)) shapeIds.add(id)

    for (const id of shapeIds) {
        const l = localStore[id]
        const r = remoteStore[id]
        const inBase = id in base
        const hasL = l?.typeName === 'shape'
        const hasR = r?.typeName === 'shape'

        // 上次同步之後，這一邊有沒有動過它
        const localChanged = hasL ? (!inBase || hashRecord(l) !== base[id]) : inBase
        const remoteChanged = hasR ? (!inBase || hashRecord(r) !== base[id]) : inBase

        if (hasL && hasR) {
            if (localChanged && remoteChanged) {
                // 兩邊都改了同一張卡——這是唯一真的要丟掉一邊的情況
                const same = hashRecord(l) === hashRecord(r)
                if (!same) stats.conflicts++
                const winner = options.preferRemoteOnConflict ? r : l
                if (!same && options.preferRemoteOnConflict) stats.updated++
                merged[id] = winner
            } else if (remoteChanged) {
                merged[id] = r
                stats.updated++
            } else {
                merged[id] = l
            }
            continue
        }

        if (hasL && !hasR) {
            // 遠端沒有：base 有 ⇒ 遠端刪掉了；base 沒有 ⇒ 本機新增的
            if (!inBase) { merged[id] = l; continue }         // 本機新增，保留
            if (localChanged) { merged[id] = l; continue }    // 遠端刪、本機改 ⇒ 編輯優先，別丟掉剛做的修改
            stats.removed++                                   // 遠端刪除，本機沒動 ⇒ 跟著刪
            continue
        }

        if (!hasL && hasR) {
            // 本機沒有：base 有 ⇒ 本機刪掉了；base 沒有 ⇒ 遠端新增的
            if (!inBase) { merged[id] = r; stats.added++; continue }   // 遠端新增，收下
            if (remoteChanged) { merged[id] = r; stats.added++; continue } // 本機刪、遠端改 ⇒ 編輯優先
            continue                                                   // 本機刪除，遠端沒動 ⇒ 維持刪除
        }
        // 兩邊都沒有（只存在於 base）⇒ 兩邊都刪了，不用做事
    }

    const changed =
        stats.added > 0 || stats.updated > 0 || stats.removed > 0 || stats.conflicts > 0

    return { snapshot: withUpdatedStore(local, merged), stats, changed }
}

/** 給 UI 用的一句話摘要；沒有任何變動時回 null */
export function describeMerge(stats: MergeStats): string | null {
    const parts: string[] = []
    if (stats.added > 0) parts.push(`收到 ${stats.added} 張新卡片`)
    if (stats.updated > 0) parts.push(`更新 ${stats.updated} 張`)
    if (stats.removed > 0) parts.push(`移除 ${stats.removed} 張`)
    if (stats.conflicts > 0) parts.push(`${stats.conflicts} 張兩邊都改過（保留較新的那一邊）`)
    return parts.length > 0 ? parts.join('、') : null
}

/** 型別再匯出，方便呼叫端不必再從 snapshot.ts 拿 */
export type { TLSnapshotStoreRecord }
