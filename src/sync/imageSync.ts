// src/sync/imageSync.ts
// image 卡的圖片檔同步（Supabase Storage）。
//
// ── 這個檔案要解決的問題 ─────────────────────────────────────────────────────
// TD-IMG 之後，image 卡的 snapshot 只留 `props.storedName`、`props.image` 為 null，
// 實體檔在 `userData/files/<storedName>`。這對單機是純好處（記憶體、IndexedDB、備份
// 全都瘦下來），但**同步只搬 snapshot**——另一台裝置拿到的是一個指向它沒有的檔案的
// 名字，畫面上就是一張破圖，而且完全沒有徵兆可查。
//
// 做法：把實體檔上傳到 Supabase Storage，物件路徑用 `<userId>/<storedName>`。
// storedName 是 uuid + 副檔名、**內容不可變**（改圖 = 產生新的 storedName），
// 所以「上傳過就永遠不用再上傳」，這讓整條路徑可以做得很簡單：
//
//   推送前：這塊板引用到的圖，沒上傳過的就上傳
//   拉取後：這塊板引用到的圖，本機沒有的就下載
//
// ── 三個刻意的邊界 ──────────────────────────────────────────────────────────
// 1. **只管 image 卡**。file 卡雖然也用 storedName、也存在同一個資料夾，但它的大小
//    是沒有上限的（使用者可以附一支 500MB 的影片）。圖片至少經過壓縮。
//    file 卡要不要同步是另一個決定，不要順手一起做。
// 2. **不刪雲端的孤兒物件**。卡片刪掉後 Storage 那份會留著。GC 與墓碑列的 GC 是
//    同一類問題（見 roadmap-mobile「尚未做」），一起處理才不會做兩套。
// 3. **PWA 端不在這條路徑上**。手機沒有 electronAPI，`canSyncImages()` 回 false，
//    整個模組就是一連串 no-op。手機要看到圖是 S2（手機讀全部）的事。
import { getSupabase, getCurrentUserId, describeNetworkError } from './supabaseClient'
import { getCardShapes } from '../utils/snapshot'
import { canSyncImages, hasImage, readImageBytes, writeImageBytes } from '../platform/imageStore'
import type { TLEditorSnapshot } from 'tldraw'

/** Storage bucket 名稱。建立方式見 supabase/schema.sql 最後一段。 */
export const IMAGE_BUCKET = 'card-images'

/**
 * 從 snapshot 撈出所有 image 卡引用到的 storedName（去重、保序）。
 *
 * 純函式，好測：這是整條路徑最容易安靜出錯的一環——選錯卡片型別或欄位名，
 * 結果是「同步看起來成功、圖就是不見」，沒有任何錯誤訊息。
 */
export function collectImageNames(snapshot: TLEditorSnapshot | null): string[] {
    const names: string[] = []
    const seen = new Set<string>()
    for (const shape of getCardShapes(snapshot)) {
        if (shape.props.type !== 'image') continue
        const name = shape.props.storedName
        if (typeof name !== 'string' || !name) continue
        if (seen.has(name)) continue
        seen.add(name)
        names.push(name)
    }
    return names
}

/** 物件路徑。前綴 userId 是 RLS 政策的判斷依據（見 schema.sql 的 storage 政策）。 */
export function imageObjectPath(userId: string, storedName: string): string {
    return `${userId}/${storedName}`
}

export interface ImageSyncResult {
    /** 這輪實際成功上傳／下載了幾張 */
    transferred: number
    /** 失敗的 storedName 與原因；呼叫端決定要不要因此中止 */
    failures: { storedName: string; error: string }[]
}

const EMPTY_RESULT: ImageSyncResult = { transferred: 0, failures: [] }

/**
 * 把 Storage 的錯誤轉成有下一步的話。
 *
 * ⚠️ 「Bucket not found」是這個功能最可能遇到的第一個錯誤——bucket 與它的 RLS 政策
 * 是在 `supabase/schema.sql` 裡建的，使用者升級 App 之後**必須再跑一次那份 SQL**，
 * 否則所有含圖片的板都會推不上去。照原文吐出來的話沒有人猜得到要去做這件事。
 * （也刻意不從程式碼自動建 bucket：那需要 service role key，而整個設計是只帶 anon key。）
 */
export function describeStorageError(message: string): string {
    const m = message.toLowerCase()
    if (m.includes('bucket not found')) {
        return `雲端還沒有 ${IMAGE_BUCKET} 儲存桶——請到 Supabase 的 SQL Editor 重跑一次 supabase/schema.sql`
    }
    if (m.includes('row-level security') || m.includes('violates')) {
        return `沒有寫入 ${IMAGE_BUCKET} 的權限——請確認 supabase/schema.sql 最後那段 storage 政策已經套用`
    }
    return message
}

/** 從副檔名猜 MIME。Storage 存了 contentType，之後直接開 URL 才會被當圖片看待。 */
function guessContentType(storedName: string): string {
    const ext = storedName.slice(storedName.lastIndexOf('.') + 1).toLowerCase()
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
    if (ext === 'gif') return 'image/gif'
    if (ext === 'webp') return 'image/webp'
    if (ext === 'svg') return 'image/svg+xml'
    return 'image/png'
}

/**
 * 把這些圖上傳到 Storage。`alreadyUploaded` 是呼叫端記住的「推過的名字」，
 * 命中就跳過——圖片內容不可變，所以這個快取不會過期。
 *
 * ⚠️ 本機讀不到檔（使用者手動刪過 userData/files、或從舊備份還原）**不算失敗**：
 * 那張圖本來就已經回不來了，把它記成失敗只會讓整塊板永遠推不上去。
 * 回傳的 `uploaded` 只含真的送上去的，呼叫端據此更新記錄。
 */
export async function uploadImages(
    storedNames: string[],
    alreadyUploaded: (storedName: string) => boolean,
): Promise<ImageSyncResult & { uploaded: string[] }> {
    if (storedNames.length === 0 || !canSyncImages()) return { ...EMPTY_RESULT, uploaded: [] }

    const supabase = getSupabase()
    if (!supabase) return { ...EMPTY_RESULT, uploaded: [] }
    const userId = await getCurrentUserId()
    if (!userId) return { ...EMPTY_RESULT, uploaded: [] }

    const uploaded: string[] = []
    const failures: ImageSyncResult['failures'] = []

    for (const storedName of storedNames) {
        if (alreadyUploaded(storedName)) continue

        const bytes = await readImageBytes(storedName)
        if (!bytes) {
            // 本機沒有這張圖了。記成已上傳，否則每一輪同步都會重試一次讀檔。
            uploaded.push(storedName)
            console.warn(`[imageSync] 本機找不到 ${storedName}，跳過上傳`)
            continue
        }

        try {
            const { error } = await supabase.storage
                .from(IMAGE_BUCKET)
                .upload(imageObjectPath(userId, storedName), bytes, {
                    contentType: guessContentType(storedName),
                    // upsert：同名物件已存在時覆蓋而不是報錯。storedName 是 uuid，
                    // 撞名只會發生在「上次上傳成功但記錄沒存下來」，這時覆蓋才是對的。
                    upsert: true,
                })
            if (error) { failures.push({ storedName, error: describeStorageError(error.message) }); continue }
            uploaded.push(storedName)
        } catch (e) {
            failures.push({ storedName, error: describeNetworkError(e) })
        }
    }

    return { transferred: uploaded.length, failures, uploaded }
}

/**
 * 確保這些圖在本機都有；缺的就從 Storage 下載回來。
 *
 * 刻意**不記錄「下載過哪些」**：每輪都問一次「本機有沒有這個檔」很便宜（一次 fs.access），
 * 而且這樣是自我修復的——使用者手動刪掉 userData/files 裡的檔，下一輪同步就會補回來。
 * 相對地，上傳那邊非記不可，因為「雲端有沒有」要打網路才知道。
 */
export async function downloadMissingImages(storedNames: string[]): Promise<ImageSyncResult> {
    if (storedNames.length === 0 || !canSyncImages()) return EMPTY_RESULT

    const supabase = getSupabase()
    if (!supabase) return EMPTY_RESULT
    const userId = await getCurrentUserId()
    if (!userId) return EMPTY_RESULT

    let transferred = 0
    const failures: ImageSyncResult['failures'] = []

    for (const storedName of storedNames) {
        if (await hasImage(storedName)) continue

        try {
            const { data, error } = await supabase.storage
                .from(IMAGE_BUCKET)
                .download(imageObjectPath(userId, storedName))
            if (error) { failures.push({ storedName, error: describeStorageError(error.message) }); continue }
            if (!data) { failures.push({ storedName, error: '雲端沒有這張圖' }); continue }

            const ok = await writeImageBytes(storedName, await data.arrayBuffer())
            if (!ok) { failures.push({ storedName, error: '寫入本機失敗' }); continue }
            transferred++
        } catch (e) {
            failures.push({ storedName, error: describeNetworkError(e) })
        }
    }

    return { transferred, failures }
}
