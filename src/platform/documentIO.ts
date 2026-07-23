// src/platform/documentIO.ts
//
// 「手動儲存整份 tldraw document」的平台薄接縫（roadmap-mobile S0(a) 的 src/platform/ 接縫之一）。
// 桌面：把 snapshot JSON 字串寫入 electron-store（工具列「儲存」鈕的舊有手動匯出；
// 日常存檔其實走 Dexie/IndexedDB，此按鈕是額外的本機 document 快照）。
// web/PWA 無 electron-store：canSaveDocument 回 false（隱藏按鈕）、saveDocument no-op。
//
// 註：preload 另暴露 loadDocument / openDocument 兩條 IPC，但 renderer 目前**無任何呼叫者**
//     （宣告即死碼）——故此接縫不予包裝，避免加進沒人用的程式碼。待清理見 electron-ipc.md。
// 比照 imageStore.ts / linkOpener.ts / linkPreview.ts / fileStore.ts。

/** 目前平台是否支援「手動儲存 document 到本機」（＝有 Electron store IPC）。UI 據此決定是否顯示儲存鈕。 */
export function canSaveDocument(): boolean {
    return !!window.electronAPI?.saveDocument
}

/** 把整份 document JSON 字串寫入本機（electron-store）。無 API 時 no-op。 */
export function saveDocument(data: string): void {
    window.electronAPI?.saveDocument?.(data)
}
