// @vitest-environment jsdom
// src/utils/exportMarkdown.test.ts
//
// 用到 DOMParser，需要 jsdom 環境。
import { describe, it, expect } from 'vitest'
import { htmlToMarkdown, cardToMarkdown } from './exportMarkdown'
import type { TLCardProps } from '../components/card-shape/type/CardShape'

// 用工廠函式產生測試用 props，只填關心的欄位，其餘交給 cast。
const props = (p: Partial<TLCardProps> & { type: string }) => p as TLCardProps

describe('htmlToMarkdown', () => {
    it('標題轉成 # 語法', () => {
        expect(htmlToMarkdown('<h1>標題</h1>')).toBe('# 標題')
        expect(htmlToMarkdown('<h2>次標</h2>')).toBe('## 次標')
    })

    it('粗體 / 斜體 / 行內程式碼', () => {
        expect(htmlToMarkdown('<strong>粗</strong>')).toBe('**粗**')
        expect(htmlToMarkdown('<em>斜</em>')).toBe('*斜*')
        expect(htmlToMarkdown('<code>x</code>')).toBe('`x`')
    })

    it('連結轉成 [文字](url)', () => {
        expect(htmlToMarkdown('<a href="https://g.com">G</a>')).toBe('[G](https://g.com)')
    })

    it('螢光筆轉成 ==文字==', () => {
        expect(htmlToMarkdown('<mark>重點</mark>')).toBe('==重點==')
    })

    it('提示框轉成 blockquote 帶 💡', () => {
        expect(htmlToMarkdown('<div class="callout"><p>注意這件事</p></div>'))
            .toBe('> 💡\n> 注意這件事')
    })

    it('一般 div 不當提示框，只取內文', () => {
        expect(htmlToMarkdown('<div><p>普通</p></div>')).toBe('普通')
    })

    it('摺疊區塊轉成粗體標題 + 內文', () => {
        expect(htmlToMarkdown(
            '<details class="toggle-block" open><summary>更多細節</summary><div class="details-content"><p>被摺疊的內容</p></div></details>'
        )).toBe('**更多細節**\n\n被摺疊的內容')
    })

    it('數學式區塊轉成 $$…$$（讀 data-latex，不理會 katex markup）', () => {
        expect(htmlToMarkdown(
            '<div class="math-block" data-latex="E = mc^2"><span class="katex">忽略的渲染結果</span></div>'
        )).toBe('$$E = mc^2$$')
    })

    it('無 latex 的數學式區塊略過', () => {
        expect(htmlToMarkdown('<div class="math-block" data-latex=""></div>')).toBe('')
    })

    it('無序清單轉成 - 項目', () => {
        expect(htmlToMarkdown('<ul><li>一</li><li>二</li></ul>')).toBe('- 一\n- 二')
    })

    it('有序清單轉成數字項目', () => {
        expect(htmlToMarkdown('<ol><li>甲</li><li>乙</li></ol>')).toBe('1. 甲\n2. 乙')
    })

    it('空字串回傳空字串', () => {
        expect(htmlToMarkdown('')).toBe('')
    })
})

describe('cardToMarkdown', () => {
    it('text 卡片轉 markdown', () => {
        expect(cardToMarkdown(props({ type: 'text', text: '<h1>嗨</h1>' }))).toBe('# 嗨')
    })

    it('text 空內容回傳 null（代表略過不匯出）', () => {
        expect(cardToMarkdown(props({ type: 'text', text: '' }))).toBeNull()
    })

    it('journal 卡片含日期標題', () => {
        const md = cardToMarkdown(props({ type: 'journal', journalDate: '2026-06-07', text: '<p>今天</p>' }))
        expect(md).toContain('# 2026-06-07')
        expect(md).toContain('今天')
    })

    it('todo 卡片轉成 checkbox 清單，含勾選狀態與到期日', () => {
        const md = cardToMarkdown(props({
            type: 'todo',
            text: '<p>本週</p>',
            todos: [
                { id: '1', text: '寫測試', checked: true, dueDate: '2026-06-08' },
                { id: '2', text: '休息', checked: false },
            ],
        }))
        expect(md).toContain('## 本週')
        expect(md).toContain('- [x] 寫測試 📅 2026-06-08')
        expect(md).toContain('- [ ] 休息')
    })

    it('link 有 title 時用 [title](url)', () => {
        expect(cardToMarkdown(props({ type: 'link', url: 'https://g.com', title: 'G' })))
            .toBe('[G](https://g.com)')
    })

    it('link 無 title 時用 <url> 裸連結', () => {
        expect(cardToMarkdown(props({ type: 'link', url: 'https://g.com', text: '' })))
            .toBe('<https://g.com>')
    })

    it('link 無 url 回傳 null', () => {
        expect(cardToMarkdown(props({ type: 'link', url: '' }))).toBeNull()
    })

    it('image 卡片回傳固定佔位字串', () => {
        expect(cardToMarkdown(props({ type: 'image' }))).toBe('*[圖片卡片]*')
    })

    it('board 卡片回傳白板連結字串', () => {
        expect(cardToMarkdown(props({ type: 'board', text: '專案A' }))).toBe('*[白板連結：專案A]*')
    })
})
