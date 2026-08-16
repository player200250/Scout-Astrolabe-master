// @vitest-environment jsdom
// src/utils/snapPref.test.ts —— 預設環境是 node，沒有 localStorage，要指定 jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
    SNAP_STORAGE_KEY, SNAP_DEFAULT,
    parseSnapPref, serializeSnapPref, loadSnapPref, saveSnapPref,
    resolveTidyTargets,
} from './snapPref'

describe('parseSnapPref', () => {
    it('認得 on / off', () => {
        expect(parseSnapPref('on')).toBe(true)
        expect(parseSnapPref('off')).toBe(false)
    })

    it('沒設定過回預設', () => {
        expect(parseSnapPref(null)).toBe(SNAP_DEFAULT)
    })

    // 壞值不該讓磁吸變成「關」——使用者從沒關過它，卻突然不吸了會以為壞掉
    it('壞值回預設而不是 false', () => {
        expect(parseSnapPref('')).toBe(SNAP_DEFAULT)
        expect(parseSnapPref('true')).toBe(SNAP_DEFAULT)
        expect(parseSnapPref('{"on":1}')).toBe(SNAP_DEFAULT)
    })

    it('serialize / parse 來回穩定', () => {
        for (const v of [true, false]) {
            expect(parseSnapPref(serializeSnapPref(v))).toBe(v)
        }
    })
})

describe('loadSnapPref / saveSnapPref', () => {
    beforeEach(() => { localStorage.clear() })
    afterEach(() => { vi.restoreAllMocks() })

    it('存了就讀得回來', () => {
        saveSnapPref(false)
        expect(localStorage.getItem(SNAP_STORAGE_KEY)).toBe('off')
        expect(loadSnapPref()).toBe(false)

        saveSnapPref(true)
        expect(loadSnapPref()).toBe(true)
    })

    it('第一次使用是開啟的', () => {
        expect(loadSnapPref()).toBe(true)
    })

    // 隱私模式下 localStorage 會丟例外：磁吸照跑，不能讓一個開關炸掉白板
    it('localStorage 丟例外時不拋出，讀取回預設', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })

        expect(() => saveSnapPref(false)).not.toThrow()
        expect(loadSnapPref()).toBe(SNAP_DEFAULT)
    })
})

describe('resolveTidyTargets', () => {
    it('選 2 個以上才整理', () => {
        expect(resolveTidyTargets(['a', 'b'])).toEqual(['a', 'b'])
        expect(resolveTidyTargets(['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
    })

    // 這條是刻意的：沒選取時不去動整塊板，否則日誌板照日期排的卡會被打散
    it('沒選或只選一個時回 null（不作用在整塊板）', () => {
        expect(resolveTidyTargets([])).toBeNull()
        expect(resolveTidyTargets(['a'])).toBeNull()
    })

    it('回傳的是複本，改它不會動到來源', () => {
        const src = ['a', 'b']
        const out = resolveTidyTargets(src)!
        out.push('c')
        expect(src).toEqual(['a', 'b'])
    })
})
