// src/utils/exampleBoard.test.ts
import { describe, it, expect } from 'vitest'
import { EXAMPLE_CARDS, EXAMPLE_SEED_FLAG } from './exampleBoard'

describe('EXAMPLE_SEED_FLAG', () => {
    it('是非空字串鍵', () => {
        expect(typeof EXAMPLE_SEED_FLAG).toBe('string')
        expect(EXAMPLE_SEED_FLAG.length).toBeGreaterThan(0)
    })
})

describe('EXAMPLE_CARDS', () => {
    it('至少三張、每張都有卡片型別與正尺寸', () => {
        expect(EXAMPLE_CARDS.length).toBeGreaterThanOrEqual(3)
        for (const c of EXAMPLE_CARDS) {
            expect(c.props.type).toBeTruthy()
            expect(c.props.w).toBeGreaterThan(0)
            expect(c.props.h).toBeGreaterThan(0)
            expect(Number.isFinite(c.x)).toBe(true)
            expect(Number.isFinite(c.y)).toBe(true)
        }
    })

    it('涵蓋多種卡片型別（示範用）', () => {
        const types = new Set(EXAMPLE_CARDS.map(c => c.props.type))
        expect(types.size).toBeGreaterThanOrEqual(3)
        expect(types.has('text')).toBe(true)
    })

    it('任兩張卡片的矩形範圍互不重疊', () => {
        const rect = (c: typeof EXAMPLE_CARDS[number]) => ({
            l: c.x, t: c.y, r: c.x + (c.props.w ?? 0), b: c.y + (c.props.h ?? 0),
        })
        for (let i = 0; i < EXAMPLE_CARDS.length; i++) {
            for (let j = i + 1; j < EXAMPLE_CARDS.length; j++) {
                const a = rect(EXAMPLE_CARDS[i])
                const bb = rect(EXAMPLE_CARDS[j])
                const overlap = a.l < bb.r && a.r > bb.l && a.t < bb.b && a.b > bb.t
                expect(overlap, `卡片 ${i} 與 ${j} 重疊`).toBe(false)
            }
        }
    })

    it('todo 卡的 todos 結構完整（id/text/checked）', () => {
        const todoCard = EXAMPLE_CARDS.find(c => c.props.type === 'todo')
        expect(todoCard).toBeTruthy()
        for (const t of todoCard!.props.todos ?? []) {
            expect(typeof t.id).toBe('string')
            expect(typeof t.text).toBe('string')
            expect(typeof t.checked).toBe('boolean')
        }
    })
})
