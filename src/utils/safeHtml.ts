// src/utils/safeHtml.ts — 卡片 HTML 顯示前的消毒
//
// 唯讀文字卡、月摘要都用 dangerouslySetInnerHTML 直接注入存檔的 HTML。平常是 TipTap 自己產生的，
// 但匯入別人給的白板 JSON 時，p.text 可以是任何字串：<img onerror>、<script>、javascript: 連結，
// 注入後就在主視窗跑——主視窗有 electronAPI（開外部網址、寫備份檔…）。所以注入前一律過 DOMPurify。
//
// 保留的東西（唯讀畫面要用）：class、style、data-*（wikilink、toggle 三角形、data-latex）、
// <details open>、KaTeX 存進去的 MathML，以及連結的 target（沒有 target 的 <a> 被點到會把整個主視窗導走）。

import DOMPurify from 'dompurify'

export function sanitizeCardHtml(html: string): string {
    return DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'contenteditable'] })
}
