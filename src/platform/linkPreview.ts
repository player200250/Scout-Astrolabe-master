// src/platform/linkPreview.ts
//
// 「抓取連結預覽 metadata」的平台薄接縫（roadmap-mobile S0(a) 的 src/platform/ 接縫之一）。
// 桌面走 window.electronAPI.getLinkPreview（main-process net.fetch 爬 og/meta tags、繞過 CORS）；
// 無 electronAPI（未來 PWA/web）或失敗時回 null——手機端不做連結預覽。比照 imageStore.ts / linkOpener.ts。

/** 對應 electronAPI.getLinkPreview 的回傳形狀（image 可能為 null）。 */
export interface LinkPreviewResult {
    title?: string
    description?: string
    image?: string | null
}

/**
 * 抓取 URL 的預覽 metadata。桌面走 Electron 主程序爬蟲；
 * 非瀏覽器 context、無 electronAPI、或抓取失敗一律回 null，呼叫端據此 fallback。
 */
export async function getLinkPreview(url: string): Promise<LinkPreviewResult | null> {
    if (typeof window === 'undefined') return null
    const api = window.electronAPI
    if (!api?.getLinkPreview) return null
    try {
        return await api.getLinkPreview(url)
    } catch {
        return null
    }
}
