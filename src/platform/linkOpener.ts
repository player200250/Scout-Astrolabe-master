// src/platform/linkOpener.ts
//
// 「開啟外部連結」的平台薄接縫（roadmap-mobile S0(a) 的 src/platform/ 接縫之一）。
// 桌面走 window.electronAPI（系統瀏覽器開啟）；無 electronAPI（未來 PWA/web）
// 時 fallback window.open。只做薄封裝，不是完整平台抽象層。比照 imageStore.ts。

/**
 * 開啟真實網址（連結卡、文字卡內的 <a>）。桌面走系統瀏覽器，
 * web fallback 用新分頁並加 noopener,noreferrer。
 * 呼叫端負責先補好 http(s) 前綴。
 */
export function openLink(url: string): void {
    if (window.electronAPI?.openLink) window.electronAPI.openLink(url)
    else window.open(url, '_blank', 'noopener,noreferrer')
}

/**
 * 在外部開啟一個（通常是本機 blob）URL，例如圖片卡的「新分頁」預覽。
 * 桌面走 electronAPI.openExternal，web fallback 開新分頁。
 */
export function openExternalUrl(url: string): void {
    if (window.electronAPI?.openExternal) window.electronAPI.openExternal(url)
    else window.open(url, '_blank')
}
