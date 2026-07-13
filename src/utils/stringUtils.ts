// src/utils/stringUtils.ts
//
// 共用字串工具。集中各處原本各自為政的 HTML 純文字萃取邏輯（TD5 / WO3）。

/**
 * 將 HTML 字串萃取為純文字。
 *
 * 統一前各處實作不一（tag 換空格 vs 空字串、entity 處理範圍不同、是否 collapse/trim 不一），
 * 此版本取各版超集並修正一個共同缺陷：
 * 1. 只在「區塊邊界」（`</p>`、`</div>`、`</li>`、`</h1-6>`、`<br>` 等）插入空格以保留詞界，
 *    避免 `<p>a</p><p>b</p>` 被併成 `ab`；行內格式（`<strong>`、`<em>`、`<a>`…）則不插空格，
 *    避免 `<strong>粗</strong>體` 被拆成 `粗 體`（舊的「全標籤換空格」版會誤插，對 CJK 尤其糟）
 * 2. 以 `DOMParser` 移除其餘標籤並解碼所有 HTML entity（含具名與數值，如 `&amp;`、`&#39;`），比手寫 regex 完整
 * 3. 折疊連續空白並去頭尾空白
 *
 * 需要 DOM 環境（瀏覽器 / Electron renderer / jsdom 測試）。
 */
export function stripHtml(html: string): string {
    if (!html) return ''
    const spaced = html.replace(/<\/(p|div|li|h[1-6]|tr|blockquote|pre)>|<br\s*\/?>/gi, ' $&')
    const decoded = new DOMParser().parseFromString(spaced, 'text/html').body.textContent ?? ''
    return decoded.replace(/\s+/g, ' ').trim()
}

/**
 * 將卡片 HTML 拆為「標題 + 內文」，供卡片庫列表/格狀分層顯示，
 * 打破文字卡「整片都是字」的辨識困難（B6/D5）。
 *
 * - 若含 H1/H2：標題取其純文字，內文取「移除該標題後」的純文字（避免標題與內文重複）
 * - 否則：標題為 null，內文為整段純文字（呼叫端照舊只顯示內文）
 *
 * 內文以 `bodyLimit`（預設 200）字元截斷。依賴 `stripHtml`（需 DOM 環境）。
 */
export function splitTitleBody(html: string, bodyLimit = 200): { title: string | null; body: string } {
    if (!html) return { title: null, body: '' }
    const hMatch = html.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i)
    if (hMatch) {
        const title = hMatch[1].replace(/<[^>]+>/g, '').trim()
        if (title) {
            const rest = html.replace(/<h[12][^>]*>[\s\S]*?<\/h[12]>/i, ' ')
            return { title, body: stripHtml(rest).slice(0, bodyLimit) }
        }
    }
    return { title: null, body: stripHtml(html).slice(0, bodyLimit) }
}
