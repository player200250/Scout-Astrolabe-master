// src/hooks/useBoardAutosave.ts
//
// 白板自動存檔的生命週期（P0 修復 2，從 WhiteboardTools 抽出）。
//
// ── 規則 ──────────────────────────────────────────────────────────────
// 1. 編輯後 debounce 500ms 才存（不改成每次變更就寫）。
// 2. **卸載時有待存的變更 ⇒ 立刻存，而不是丟掉。** 白板以 `key={board.id}` 掛載，
//    每次切換白板都會卸載；以前 cleanup 只 clearTimeout，切板前 0.5 秒內的編輯就沒了。
//    日記編輯器（JournalCardEditor 的 flushPending）修過同一類問題。
// 3. 每次存檔都帶 boardId——卸載時 App 的 activeBoardId 已經換成下一塊板，
//    不能再靠「目前白板」推斷要寫進哪一塊。
// 4. 縮圖是非同步的（要等 PNG 匯出）：等縮圖期間若又有更新的存檔開始，舊的那次直接放棄，
//    不會用舊 snapshot 蓋掉新的。
// 5. 收到 `flush-pending-board-save`（還原備份前）就立刻寫掉待存變更：還原交易排在這次寫入之後，
//    還原成功不會被卸載補存蓋回；還原失敗時這段編輯也已經存好。
import { useEffect, useRef } from 'react'
import type { TLEditorSnapshot } from 'tldraw'
import { onAppEvent } from '../utils/appEvents'

export const AUTOSAVE_DEBOUNCE_MS = 500

/** tldraw store 中本 hook 用到的最小介面（測試可用假的） */
export interface AutosaveStore {
    listen: (cb: () => void, opts: { scope: 'document' }) => () => void
}

export interface UseBoardAutosaveOptions {
    store: AutosaveStore | null | undefined
    boardId: string
    /** 同步取得目前 snapshot */
    getSnapshot: () => TLEditorSnapshot
    /** 寫入；thumbnail 傳 undefined＝保留現有縮圖 */
    onSave: (snapshot: TLEditorSnapshot, thumbnail: string | null | undefined, boardId: string) => void
    /** 一般 debounce 存檔時要不要附帶縮圖（回 undefined＝這次不產）。卸載補存時不呼叫。 */
    getThumbnail?: () => Promise<string | null | undefined>
}

export function useBoardAutosave({ store, boardId, getSnapshot, onSave, getThumbnail }: UseBoardAutosaveOptions): void {
    // 全部走 ref：父元件每次 render 都會給新的函式，不能讓它們重建 listener 而取消計時器
    const latest = useRef({ boardId, getSnapshot, onSave, getThumbnail })
    latest.current = { boardId, getSnapshot, onSave, getThumbnail }

    useEffect(() => {
        if (!store) return
        let timer: ReturnType<typeof setTimeout> | null = null
        let dirty = false
        let seq = 0   // 每取一次 snapshot 就 +1；非同步完成時若已不是最新就放棄

        const commit = (snapshot: TLEditorSnapshot, thumbnail: string | null | undefined) => {
            const { onSave: save, boardId: id } = latest.current
            try {
                save(snapshot, thumbnail, id)
            } catch (err) {
                console.error('[autosave] 白板存檔失敗', err)
            }
        }

        /** 取 snapshot 失敗（例如 editor 已釋放）時回 null，呼叫端放棄這次存檔並記錄 */
        const takeSnapshot = (): TLEditorSnapshot | null => {
            try {
                return latest.current.getSnapshot()
            } catch (err) {
                console.error('[autosave] 取得白板 snapshot 失敗，這次未存檔', err)
                return null
            }
        }

        const runDebounced = async () => {
            timer = null
            if (!dirty) return
            dirty = false
            const snapshot = takeSnapshot()
            if (!snapshot) return
            const mySeq = ++seq
            let thumbnail: string | null | undefined = undefined
            if (latest.current.getThumbnail) {
                try { thumbnail = await latest.current.getThumbnail() } catch { thumbnail = undefined }
            }
            if (mySeq !== seq) return   // 等縮圖期間已有更新的存檔，舊的不寫
            commit(snapshot, thumbnail)
        }

        /** 立刻寫掉待存變更（不等縮圖）。卸載、離開頁面時用。 */
        const flush = () => {
            if (timer) { clearTimeout(timer); timer = null }
            if (!dirty) return
            dirty = false
            const snapshot = takeSnapshot()
            if (!snapshot) return
            ++seq   // 讓還在等縮圖的舊存檔放棄
            commit(snapshot, undefined)
        }

        const offStore = store.listen(() => {
            dirty = true
            if (timer) clearTimeout(timer)
            timer = setTimeout(() => { void runDebounced() }, AUTOSAVE_DEBOUNCE_MS)
        }, { scope: 'document' })

        const offFlushEvent = onAppEvent('flush-pending-board-save', () => flush())
        // 關閉視窗／重新載入：盡力而為（IndexedDB 寫入在頁面卸載時不保證完成）
        window.addEventListener('pagehide', flush)

        return () => {
            offStore()
            offFlushEvent()
            window.removeEventListener('pagehide', flush)
            flush()
        }
    }, [store])
}
