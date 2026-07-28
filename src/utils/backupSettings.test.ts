// @vitest-environment jsdom
// src/utils/backupSettings.test.ts
//
// 這個設定直接決定 trimBackups 會刪掉多少份備份，所以「壞掉的設定值」不能傳下去——
// 傳一個 NaN 進去會讓 slice 算出垃圾範圍。這裡的重點就是：不管 localStorage 裡是什麼，
// 出來的一定是合法份數。
import { describe, it, expect, beforeEach } from 'vitest'
import {
    normalizeBackupLimit, getBackupLimit, setBackupLimit,
    DEFAULT_BACKUP_LIMIT, BACKUP_LIMIT_OPTIONS,
} from './backupSettings'

beforeEach(() => localStorage.clear())

describe('normalizeBackupLimit', () => {
    it('合法選項原樣通過', () => {
        for (const opt of BACKUP_LIMIT_OPTIONS) {
            expect(normalizeBackupLimit(opt)).toBe(opt)
        }
    })

    it('數字字串會被解析（localStorage 存的就是字串）', () => {
        expect(normalizeBackupLimit('10')).toBe(10)
    })

    it('不在選項內時取最接近的，而不是退回預設', () => {
        expect(normalizeBackupLimit(12)).toBe(10)
        expect(normalizeBackupLimit(4)).toBe(3)   // 距 3 與 5 相同 → 往小的靠（越大越吃空間）
        expect(normalizeBackupLimit(999)).toBe(20)
    })

    it('壞值退回預設，不會產生 NaN', () => {
        expect(normalizeBackupLimit('abc')).toBe(DEFAULT_BACKUP_LIMIT)
        expect(normalizeBackupLimit(null)).toBe(DEFAULT_BACKUP_LIMIT)
        expect(normalizeBackupLimit(undefined)).toBe(DEFAULT_BACKUP_LIMIT)
        expect(normalizeBackupLimit({})).toBe(DEFAULT_BACKUP_LIMIT)
    })

    it('負數與 0 收斂到最小選項', () => {
        expect(normalizeBackupLimit(0)).toBe(BACKUP_LIMIT_OPTIONS[0])
        expect(normalizeBackupLimit(-5)).toBe(BACKUP_LIMIT_OPTIONS[0])
    })
})

describe('getBackupLimit / setBackupLimit', () => {
    it('沒設定過時回預設', () => {
        expect(getBackupLimit()).toBe(DEFAULT_BACKUP_LIMIT)
    })

    it('存了就讀得回來', () => {
        setBackupLimit(20)
        expect(getBackupLimit()).toBe(20)
    })

    it('存非法值時寫入的是正規化後的結果', () => {
        expect(setBackupLimit(12)).toBe(10)
        expect(getBackupLimit()).toBe(10)
    })

    it('localStorage 被手改壞也不會傳出壞值', () => {
        localStorage.setItem('astrolabe.backupLimit', 'ninety')
        expect(getBackupLimit()).toBe(DEFAULT_BACKUP_LIMIT)
    })
})
