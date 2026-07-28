// src/utils/markdownImport.test.ts
//
// C4 匯入的重點不是「支援多少 Markdown 語法」，而是**只產生 TipTap schema 有的節點**：
// 轉出 schema 以外的標籤，TipTap 載入時會整段吞掉，使用者會看到卡片莫名少一塊。
// 另外驗與 exportMarkdown 的往返（提示框、待辦符號這些自家慣例）。
import { describe, it, expect } from 'vitest'
import { looksLikeMarkdown, markdownTitle, markdownToHtml } from './markdownImport'

describe('looksLikeMarkdown', () => {
    it('# 開頭且多行 → 是', () => {
        expect(looksLikeMarkdown('# 標題\n內文')).toBe(true)
        expect(looksLikeMarkdown('  ## 次標題\n- 一\n- 二')).toBe(true)
    })

    it('普通文字不誤判（貼上一般文字不該被打斷）', () => {
        expect(looksLikeMarkdown('今天天氣不錯\n明天再說')).toBe(false)
        expect(looksLikeMarkdown('#沒有空白\n內文')).toBe(false)
        expect(looksLikeMarkdown('# 只有一行')).toBe(false)
        expect(looksLikeMarkdown('')).toBe(false)
    })
})

describe('markdownTitle', () => {
    it('取第一行 H1', () => {
        expect(markdownTitle('# 專案筆記\n\n內文')).toBe('專案筆記')
    })
    it('沒有標題時回 null', () => {
        expect(markdownTitle('內文而已')).toBeNull()
    })
})

describe('markdownToHtml', () => {
    it('標題轉 h1–h3，第一個 h1 之後會被 splitTitleBody 當卡片標題', () => {
        expect(markdownToHtml('# 一\n## 二\n### 三')).toBe('<h1>一</h1><h2>二</h2><h3>三</h3>')
    })

    it('段落與軟換行', () => {
        expect(markdownToHtml('第一行\n第二行\n\n另一段')).toBe('<p>第一行<br>第二行</p><p>另一段</p>')
    })

    it('無序／有序清單', () => {
        expect(markdownToHtml('- 甲\n- 乙')).toBe('<ul><li><p>甲</p></li><li><p>乙</p></li></ul>')
        expect(markdownToHtml('1. 甲\n2. 乙')).toBe('<ol><li><p>甲</p></li><li><p>乙</p></li></ol>')
    })

    it('待辦清單沒有對應節點 → 用 ☐／☑ 保留語意，不產生 schema 外的標籤', () => {
        const html = markdownToHtml('- [ ] 還沒做\n- [x] 做完了')
        expect(html).toBe('<ul><li><p>☐ 還沒做</p></li><li><p>☑ 做完了</p></li></ul>')
        expect(html).not.toContain('input')
    })

    it('行內語法：粗體／斜體／螢光筆／行內 code／連結', () => {
        expect(markdownToHtml('**粗** *斜* ==螢光== `x=1`'))
            .toBe('<p><strong>粗</strong> <em>斜</em> <mark>螢光</mark> <code>x=1</code></p>')
        expect(markdownToHtml('看 [官網](https://example.com)'))
            .toBe('<p>看 <a href="https://example.com">官網</a></p>')
    })

    it('行內 code 裡的星號與方括號不被當語法', () => {
        expect(markdownToHtml('`**not bold**`')).toBe('<p><code>**not bold**</code></p>')
    })

    it('圍欄程式碼原樣保留並逃脫 HTML', () => {
        expect(markdownToHtml('```js\nif (a < b) {}\n```'))
            .toBe('<pre><code class="language-js">if (a &lt; b) {}</code></pre>')
    })

    it('引用轉 blockquote；`> 💡` 開頭還原成 callout（與匯出端對稱）', () => {
        expect(markdownToHtml('> 一句話')).toBe('<blockquote><p>一句話</p></blockquote>')
        expect(markdownToHtml('> 💡\n> 提示內容')).toBe('<div class="callout"><p>提示內容</p></div>')
    })

    it('分隔線', () => {
        expect(markdownToHtml('前\n\n---\n\n後')).toBe('<p>前</p><hr><p>後</p>')
    })

    it('逃脫 HTML，貼進來的標籤不會變成真的節點', () => {
        expect(markdownToHtml('<script>alert(1)</script>'))
            .toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')
    })

    it('底線是匯出端寫成的原始 <u>，要還原成標籤', () => {
        expect(markdownToHtml('<u>底線</u>')).toBe('<p><u>底線</u></p>')
    })

    it('空輸入回一個空段落（TipTap 的空文件形式）', () => {
        expect(markdownToHtml('')).toBe('<p></p>')
        expect(markdownToHtml('\n\n')).toBe('<p></p>')
    })
})
