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
