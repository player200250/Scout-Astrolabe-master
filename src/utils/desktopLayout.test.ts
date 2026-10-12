// src/utils/desktopLayout.test.ts
import { describe, it, expect } from 'vitest'
import {
    defaultDesktopLayout, normalizeDesktopLayout, visibleDesktopCards, desktopRowCount,
    swapDesktopCards, moveDesktopCard, desktopNeighbor, hideDesktopCard, showDesktopCard,
    canHideDesktopCard, sameDesktopLayout, DESKTOP_CARD_IDS,
    type DesktopCardId, type DesktopLayout,
} from './desktopLayout'

const layout = (order: DesktopCardId[], hidden: DesktopCardId[] = []): DesktopLayout => ({ version: 1, order, hidden })

describe('normalizeDesktopLayout', () => {
    it('預設＝ v1.5.0 的 2×2，全部顯示', () => {
        expect(defaultDesktopLayout()).toEqual(layout(['clock', 'tasks', 'recent-boards', 'quick-note']))
    })

    it('壞掉的存檔回預設', () => {
        for (const raw of [null, undefined, 'x', 42, [], { order: 'x' }]) {
            expect(normalizeDesktopLayout(raw)).toEqual(defaultDesktopLayout())
        }
    })

    it('保留使用者的順序與隱藏', () => {
        const saved = layout(['quick-note', 'clock', 'tasks', 'recent-boards'], ['recent-boards'])
        expect(normalizeDesktopLayout(saved)).toEqual(saved)
    })

    it('不認得的丟掉、重複的只留第一個、缺的補到最後', () => {
        expect(normalizeDesktopLayout({ order: ['tasks', 'weather', 'tasks', 'clock'], hidden: ['weather'] }))
            .toEqual(layout(['tasks', 'clock', 'recent-boards', 'quick-note']))
    })

    it('快速筆記一律顯示', () => {
        expect(normalizeDesktopLayout({ order: [...DESKTOP_CARD_IDS], hidden: ['quick-note', 'clock'] }).hidden)
            .toEqual(['clock'])
    })

    it('hidden 依 order 排序', () => {
        expect(normalizeDesktopLayout({ order: [...DESKTOP_CARD_IDS], hidden: ['recent-boards', 'clock'] }).hidden)
            .toEqual(['clock', 'recent-boards'])
    })
})

describe('列數', () => {
    it('2 欄，最多 3 列', () => {
        expect([0, 1, 2, 3, 4, 5, 6, 9].map(desktopRowCount)).toEqual([1, 1, 1, 2, 2, 3, 3, 3])
    })
})

describe('交換與移動', () => {
    const base = defaultDesktopLayout() // clock tasks / recent-boards quick-note

    it('拖曳交換兩張', () => {
        expect(swapDesktopCards(base, 'clock', 'quick-note').order)
            .toEqual(['quick-note', 'tasks', 'recent-boards', 'clock'])
    })

    it('隱藏的卡不能拿來交換', () => {
        const l = hideDesktopCard(base, 'tasks')
        expect(swapDesktopCards(l, 'clock', 'tasks')).toBe(l)
    })

    it('方向鍵在 2×2 裡移動', () => {
        expect(moveDesktopCard(base, 'clock', 'right').order).toEqual(['tasks', 'clock', 'recent-boards', 'quick-note'])
        expect(moveDesktopCard(base, 'clock', 'down').order).toEqual(['recent-boards', 'tasks', 'clock', 'quick-note'])
        expect(moveDesktopCard(base, 'quick-note', 'up').order).toEqual(['clock', 'quick-note', 'recent-boards', 'tasks'])
    })

    it('撞牆不動、不跨列', () => {
        expect(moveDesktopCard(base, 'clock', 'left')).toBe(base)
        expect(moveDesktopCard(base, 'clock', 'up')).toBe(base)
        expect(moveDesktopCard(base, 'tasks', 'right')).toBe(base)
        expect(moveDesktopCard(base, 'quick-note', 'down')).toBe(base)
    })

    it('交換時跳過隱藏的卡（只看畫面上的格子）', () => {
        // 藏掉 tasks：畫面是 clock recent-boards / quick-note（橫跨）
        const l = hideDesktopCard(base, 'tasks')
        expect(moveDesktopCard(l, 'clock', 'right').order).toEqual(['recent-boards', 'tasks', 'clock', 'quick-note'])
    })

    it('單數張：最後一張橫跨兩欄，上下都接得到、左右不動', () => {
        const visible: DesktopCardId[] = ['clock', 'tasks', 'quick-note']
        expect(desktopNeighbor(visible, 'quick-note', 'up')).toBe('clock')
        expect(desktopNeighbor(visible, 'quick-note', 'left')).toBeNull()
        expect(desktopNeighbor(visible, 'quick-note', 'right')).toBeNull()
        expect(desktopNeighbor(visible, 'clock', 'down')).toBe('quick-note')
        expect(desktopNeighbor(visible, 'tasks', 'down')).toBe('quick-note')
    })

    it('只剩一張時哪裡都去不了', () => {
        for (const dir of ['up', 'down', 'left', 'right'] as const) {
            expect(desktopNeighbor(['quick-note'], 'quick-note', dir)).toBeNull()
        }
    })
})

describe('隱藏與加回', () => {
    const base = defaultDesktopLayout()

    it('快速筆記不能隱藏', () => {
        expect(canHideDesktopCard(base, 'quick-note')).toBe(false)
        expect(hideDesktopCard(base, 'quick-note')).toBe(base)
    })

    it('隱藏後從畫面消失、順序還在', () => {
        const l = hideDesktopCard(base, 'recent-boards')
        expect(visibleDesktopCards(l)).toEqual(['clock', 'tasks', 'quick-note'])
        expect(l.order).toEqual(base.order)
    })

    it('加回來的卡放在最後一格', () => {
        const l = showDesktopCard(hideDesktopCard(base, 'clock'), 'clock')
        expect(visibleDesktopCards(l)).toEqual(['tasks', 'recent-boards', 'quick-note', 'clock'])
        expect(l.hidden).toEqual([])
    })

    it('比較', () => {
        expect(sameDesktopLayout(base, defaultDesktopLayout())).toBe(true)
        expect(sameDesktopLayout(base, hideDesktopCard(base, 'clock'))).toBe(false)
    })
})
