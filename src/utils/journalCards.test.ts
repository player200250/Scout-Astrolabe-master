// @vitest-environment jsdom
// src/utils/journalCards.test.ts
import { describe, it, expect } from 'vitest'
import { isUntouchedTemplate } from './journalCards'

const TEMPLATE =
    '<h2>第 34 週回顧（8/17 - 8/23）</h2>'
    + '<p><strong>這週完成了什麼</strong></p><p></p>'
    + '<p><strong>這週學到什麼</strong></p><p></p>'
    + '<p><strong>卡住的地方 &amp; 解法</strong></p><p></p>'

describe('isUntouchedTemplate', () => {
    it('與模板一字不差 → 視為未動過', () => {
        expect(isUntouchedTemplate(TEMPLATE, TEMPLATE)).toBe(true)
    })

    // RC9 的實際情境：打了字又在 900ms 內刪掉，存檔時拿到的就是原封不動的模板
    it('空字串與 null 也算未動過（卡片還不存在時的初始狀態）', () => {
        expect(isUntouchedTemplate('', '')).toBe(true)
        expect(isUntouchedTemplate(null, '')).toBe(true)
        expect(isUntouchedTemplate(undefined, '')).toBe(true)
    })

    it('真的寫了東西 → 不是未動過', () => {
        const written = TEMPLATE.replace('<p></p>', '<p>修好了月曆的格線</p>')
        expect(isUntouchedTemplate(written, TEMPLATE)).toBe(false)
    })

    it('只差在標籤與空白 → 仍視為未動過（比的是去標籤後的文字）', () => {
        const reformatted = TEMPLATE.replace('<strong>這週完成了什麼</strong>', '這週完成了什麼')
        expect(isUntouchedTemplate(reformatted, TEMPLATE)).toBe(true)
    })

    it('內容被整個清空 → 不是未動過（使用者可能是刻意清掉）', () => {
        expect(isUntouchedTemplate('<p></p>', TEMPLATE)).toBe(false)
    })
})
