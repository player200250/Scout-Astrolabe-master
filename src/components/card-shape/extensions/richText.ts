// src/components/card-shape/extensions/richText.ts
//
// 文字卡片與日記／週回顧編輯器共用的 tiptap 擴充組合。
//
// 為什麼要共用：日記原本只掛 StarterKit＋底線＋顏色。tiptap 遇到 schema 裡沒有的節點會**直接丟掉**，
// 所以一篇在白板上加了提示框／摺疊區塊／數學式的日記，拿到復盤中心打開再存檔，那些內容會無聲消失。
// 日誌板改成只當倉庫（2026-09-30）之後復盤中心是唯一的寫入口，這個落差就不能再留著。
//
// 樣式不必跟著搬：index.css 的規則掛在 `.tiptap`（編輯）與 `.tiptap-readonly`（唯讀）上，全域生效。

import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextStyle from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import Link from '@tiptap/extension-link'
import Highlight from '@tiptap/extension-highlight'
import Placeholder from '@tiptap/extension-placeholder'
import { createLowlight, common } from 'lowlight'
import { Callout } from './Callout'
import { ToggleBlock, ToggleSummary, ToggleContent } from './Toggle'
import { MathBlock } from './MathBlock'
import 'katex/dist/katex.min.css' // 全域 katex 樣式：編輯預覽與唯讀注入都靠它畫對

// 建立 lowlight 實例（包含常用語言）
const lowlight = createLowlight(common)

export function richTextExtensions(placeholder: string) {
    return [
        StarterKit.configure({ codeBlock: false }), // 停用預設 CodeBlock
        Underline,
        TextStyle,
        Color,
        CodeBlockLowlight.configure({ lowlight }), // 取代為有語法高亮的版本
        // 超連結：autolink 讓打字時自動偵測網址，linkOnPaste 讓貼上網址即成連結。
        // openOnClick:false — 編輯模式點連結只移游標不跳轉；唯讀模式的跳轉走
        // 文字卡片 viewContainerRef 的 capture-phase listener（tldraw 會攔 pointer 事件）。
        Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
        Highlight, // 螢光筆（單色，<mark>）
        Callout, // 提示框（進階批：靜態 block，唯讀走純 CSS）
        ToggleBlock, ToggleSummary, ToggleContent, // 摺疊區塊（原生 <details>，唯讀免 JS 摺疊）
        MathBlock, // 數學式區塊（LaTeX；渲染結果存進 HTML 供唯讀注入）
        Placeholder.configure({ placeholder }),
    ]
}
