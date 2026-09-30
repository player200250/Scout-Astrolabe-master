// @vitest-environment jsdom
//
// 共用擴充組合的回歸防線：日記編輯器原本只掛 StarterKit＋底線＋顏色，
// 白板上加過的提示框／摺疊區塊／螢光筆／連結，經復盤中心打開再存檔就會被 tiptap 丟掉。
// 這裡驗「文字卡片寫得出來的格式，經共用組合往返後都還在」。
import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { richTextExtensions } from './richText'

function roundtrip(html: string, extensions = richTextExtensions('')): string {
    const editor = new Editor({ extensions, content: html })
    const out = editor.getHTML()
    editor.destroy()
    return out
}

// [輸入, 輸出裡必須出現的辨識標記]——只比標記不比整串，屬性順序／附加屬性不是這裡關心的
const RICH: [string, string][] = [
    ['<div class="callout"><p>提示</p></div>', 'class="callout"'],
    ['<details class="toggle-block"><summary>標題</summary><div class="details-content"><p>內文</p></div></details>', 'class="toggle-block"'],
    ['<p><mark>重點</mark></p>', '<mark>'],
    ['<p><a href="https://example.com">連結</a></p>', 'href="https://example.com"'],
]

describe('richTextExtensions：格式往返不流失', () => {
    it.each(RICH)('保留 %s', (html, marker) => {
        expect(roundtrip(html)).toContain(marker)
    })

    it('對照組：舊的日記組合（只有 StarterKit）會把提示框洗掉——這就是要修的問題', () => {
        const out = roundtrip(RICH[0][0], [StarterKit])
        expect(out).not.toContain('class="callout"')
    })
})
