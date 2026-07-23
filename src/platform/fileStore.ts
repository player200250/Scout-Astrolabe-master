// src/platform/fileStore.ts
//
// 「檔案卡附件」的平台薄接縫（roadmap-mobile S0(a) 的 src/platform/ 接縫之一）。
// 桌面走 window.electronAPI：把使用者選的檔案複製進 userData/files/（UUID 命名）、
// 以系統程式開啟、刪除。userData/files/ 同時放圖片卡與檔案卡的實體檔，故「刪檔」是
// 通用操作（deleteStoredFile）——imageStore.deleteImage 也委派到這裡＝單一真相來源。
// web/PWA 無檔案系統：canAttachFile 回 false（UI 隱藏上傳入口）、開檔/刪檔 no-op、
// 選檔回 null。比照 imageStore.ts / linkOpener.ts / linkPreview.ts。

/** 選檔並複製進 userData/files/ 後回傳的 metadata（對應 electronAPI.selectAndCopyFile）。 */
export interface FilePickResult {
    storedName: string
    originalName: string
    size: number
    ext: string
}

/** 目前平台是否支援「選檔上傳」（＝有 Electron 檔案 IPC）。web 端回 false，UI 據此隱藏上傳入口。 */
export function canAttachFile(): boolean {
    return !!window.electronAPI?.selectAndCopyFile
}

/** 開系統選檔器、把選取檔複製進 userData/files/，回 metadata；取消或無 API 回 null。 */
export async function selectAndCopyFile(): Promise<FilePickResult | null> {
    const api = window.electronAPI
    if (!api?.selectAndCopyFile) return null
    return api.selectAndCopyFile()
}

/** 以系統預設程式開啟 userData/files/ 中的檔案（檔案卡雙擊）。無 API 時 no-op。 */
export async function openStoredFile(storedName: string): Promise<void> {
    await window.electronAPI?.openFile?.(storedName)
}

/** 刪除 userData/files/ 中的實體檔（圖片卡與檔案卡共用）。無 API 時 no-op。 */
export function deleteStoredFile(storedName: string): void {
    window.electronAPI?.deleteFile?.(storedName)
}
