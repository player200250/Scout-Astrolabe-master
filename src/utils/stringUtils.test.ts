// @vitest-environment jsdom
// src/utils/stringUtils.test.ts
//
// 用到 DOMParser，需要 jsdom 環境。
import { describe, it, expect } from 'vitest'
import { stripHtml } from './stringUtils'

describe('stripHtml', () => {
    it('空字串回傳空字串', () => {
        expect(stripHtml('')).toBe('')
    })

    it('移除標籤只留文字', () => {
        expect(stripHtml('<p>hello</p>')).toBe('hello')
        expect(stripHtml('<strong>粗</strong>體')).toBe('粗體')
    })

    it('跨區塊元素以空格保留詞界（不會併字）', () => {
        expect(stripHtml('<p>a</p><p>b</p>')).toBe('a b')
    })

    it('解碼具名 HTML entity', () => {
        expect(stripHtml('a&nbsp;b')).toBe('a b')
        expect(stripHtml('Tom&amp;Jerry')).toBe('Tom&Jerry')
        expect(stripHtml('&lt;tag&gt;')).toBe('<tag>')
        expect(stripHtml('&quot;quoted&quot;')).toBe('"quoted"')
    })

    it('解碼數值 entity（手寫 regex 版做不到）', () => {
        expect(stripHtml('it&#39;s')).toBe("it's")
    })

    it('折疊連續空白並去頭尾空白', () => {
        expect(stripHtml('  <p>  a   b  </p>  ')).toBe('a b')
    })

    it('保留 [[wiki 連結]] 內文供 extractLinks 比對', () => {
        expect(stripHtml('<p>see [[Card A]] here</p>')).toBe('see [[Card A]] here')
    })
})
