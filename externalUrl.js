// externalUrl.js — 哪些網址可以交給 shell.openExternal（交給系統預設程式開啟）
//
// shell.openExternal 會把網址原封不動交給 Windows：`file:` 會直接執行本機檔案、
// `ms-settings:`／`search-ms:` 之類的自訂協定會叫起對應的程式。renderer 送來的網址
// 一律先過這裡，只放行瀏覽器和郵件程式該處理的三種。
//
// 純函式、不 import electron，才能直接在 vitest 裡測。

export const ALLOWED_EXTERNAL_PROTOCOLS = ['http:', 'https:', 'mailto:']

/** @param {unknown} url */
export function isSafeExternalUrl(url) {
    if (typeof url !== 'string') return false
    let parsed
    try {
        parsed = new URL(url.trim())
    } catch {
        return false
    }
    return ALLOWED_EXTERNAL_PROTOCOLS.includes(parsed.protocol)
}
