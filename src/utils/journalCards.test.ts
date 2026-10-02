// @vitest-environment jsdom
// src/utils/journalCards.test.ts
import { describe, it, expect } from 'vitest'
import { isUntouchedTemplate, reviewTargetFor } from './journalCards'
import type { BoardRecord } from '../db'

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

// RC17：跳轉目的地在日誌板 ⇒ 改開復盤中心，不切進那塊隱藏的畫布
describe('reviewTargetFor', () => {
    const snap = (cards: Record<string, Record<string, unknown>>) => ({
        document: {
            store: Object.fromEntries(Object.entries(cards).map(([id, props]) => [
                id, { id, typeName: 'shape', type: 'card', x: 0, y: 0, props },
            ])),
        },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any
    const boards = [
        { id: 'j', name: '📔 日誌', isJournal: true, snapshot: snap({
            'shape:day': { type: 'journal', journalDate: '2026-09-20' },
            'shape:week': { type: 'journal', journalDate: 'week-2026-38' },
            'shape:plan': { type: 'todo', journalDate: '2026-10-02' },
            'shape:misc': { type: 'text', journalDate: null },
        }) },
        { id: 'w', name: '工作', snapshot: snap({ 'shape:t': { type: 'text' } }) },
    ] as unknown as BoardRecord[]

    it('不在日誌板 → null（照常跳轉）', () => {
        expect(reviewTargetFor(boards, 'w', 'shape:t')).toBeNull()
        expect(reviewTargetFor(boards, undefined, 'shape:t')).toBeNull()
        expect(reviewTargetFor(boards, 'nope', 'shape:t')).toBeNull()
    })

    it('日記卡 → 日記頁那一天（本地時間，不被時區推到前一天）', () => {
        const t = reviewTargetFor(boards, 'j', 'shape:day')
        expect(t?.tab).toBe('journal')
        if (t?.tab === 'journal') expect([t.date.getFullYear(), t.date.getMonth(), t.date.getDate()]).toEqual([2026, 8, 20])
    })

    it('當天計畫待辦卡也帶 journalDate → 落在那一天', () => {
        const t = reviewTargetFor(boards, 'j', 'shape:plan')
        expect(t?.tab).toBe('journal')
        if (t?.tab === 'journal') expect(t.date.getDate()).toBe(2)
    })

    it('週回顧 → 週回顧頁，日期是那一週的週一', () => {
        const t = reviewTargetFor(boards, 'j', 'shape:week')
        expect(t?.tab).toBe('weekly')
        // 2026 第 38 週 = 9/14（一）– 9/20（日）
        if (t?.tab === 'weekly') expect([t.date.getMonth(), t.date.getDate(), t.date.getDay()]).toEqual([8, 14, 1])
    })

    it('ISO 週跨年：2026 第 1 週的週一在 2025/12/29', () => {
        const b = [{ id: 'j', isJournal: true, snapshot: snap({ 'shape:w1': { type: 'journal', journalDate: 'week-2026-01' } }) }] as unknown as BoardRecord[]
        const t = reviewTargetFor(b, 'j', 'shape:w1')
        if (t?.tab === 'weekly') expect([t.date.getFullYear(), t.date.getMonth(), t.date.getDate()]).toEqual([2025, 11, 29])
        else throw new Error('應為 weekly')
    })

    it('日誌板上沒有日期的卡、或只指定白板 → 月曆', () => {
        expect(reviewTargetFor(boards, 'j', 'shape:misc')).toEqual({ tab: 'calendar' })
        expect(reviewTargetFor(boards, 'j')).toEqual({ tab: 'calendar' })
        expect(reviewTargetFor(boards, 'j', 'shape:gone')).toEqual({ tab: 'calendar' })
    })
})
