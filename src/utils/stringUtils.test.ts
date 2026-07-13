// @vitest-environment jsdom
// src/utils/stringUtils.test.ts
//
// 用到 DOMParser，需要 jsdom 環境。
import { describe, it, expect } from 'vitest'
import { stripHtml, splitTitleBody } from './stringUtils'

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

describe('splitTitleBody', () => {
    it('空字串 → 標題 null、內文空', () => {
        expect(splitTitleBody('')).toEqual({ title: null, body: '' })
    })

    it('無標題 → 標題 null、內文為整段純文字', () => {
        expect(splitTitleBody('<p>只是一段內文</p>')).toEqual({ title: null, body: '只是一段內文' })
    })

    it('有 H1 → 取標題，內文移除標題後不重複', () => {
        expect(splitTitleBody('<h1>會議記錄</h1><p>討論事項一</p>')).toEqual({
            title: '會議記錄', body: '討論事項一',
        })
    })

    it('H2 同樣視為標題', () => {
        expect(splitTitleBody('<h2>小節</h2><p>內容</p>')).toEqual({ title: '小節', body: '內容' })
    })

    it('標題含行內標籤時只取純文字（不誤插空格）', () => {
        expect(splitTitleBody('<h1><strong>重點</strong>筆記</h1><p>x</p>')).toEqual({
            title: '重點筆記', body: 'x',
        })
    })

    it('空標題（<h1></h1>）視為無標題，退回整段內文', () => {
        expect(splitTitleBody('<h1></h1><p>內文</p>')).toEqual({ title: null, body: '內文' })
    })

    it('內文依 bodyLimit 截斷', () => {
        const body = 'a'.repeat(300)
        expect(splitTitleBody(`<h1>T</h1><p>${body}</p>`, 10)).toEqual({ title: 'T', body: 'a'.repeat(10) })
    })
})
