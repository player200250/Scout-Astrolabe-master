// src/utils/backupRetention.test.ts — 硬碟備份檔的檔名與保留規則（根目錄 backupRetention.js）
import { describe, it, expect } from 'vitest'
import {
    backupFileName, parseBackupFileName, selectBackupsToDelete, KEEP_RECENT, KEEP_DAYS,
} from '../../backupRetention.js'

const at = (y: number, mo: number, d: number, h = 12, mi = 0) => new Date(y, mo - 1, d, h, mi)

describe('檔名', () => {
    it('Date ↔ 檔名可以來回轉換', () => {
        const d = at(2026, 10, 5, 22, 7)
        expect(backupFileName(d)).toBe('vault-20261005-2207.json')
        expect(parseBackupFileName('vault-20261005-2207.json')?.getTime()).toBe(d.getTime())
    })
    it('不是備份檔的名字回 null', () => {
        expect(parseBackupFileName('files')).toBeNull()
        expect(parseBackupFileName('升級前-Chromium138-20261005')).toBeNull()
        expect(parseBackupFileName('vault-2026.json')).toBeNull()
    })
})

describe('selectBackupsToDelete', () => {
    const now = at(2026, 10, 5, 23, 0)

    it('不到上限時什麼都不刪', () => {
        const names = [backupFileName(at(2026, 10, 5, 9)), backupFileName(at(2026, 10, 5, 10))]
        expect(selectBackupsToDelete(names, now)).toEqual([])
    })

    it('同一天超過上限的舊檔被刪，但每天最後一份會留著', () => {
        // 10/04 每小時一份（24 份）＋ 10/05 每小時一份（23 份）
        const names = [
            ...Array.from({ length: 24 }, (_, h) => backupFileName(at(2026, 10, 4, h))),
            ...Array.from({ length: 23 }, (_, h) => backupFileName(at(2026, 10, 5, h))),
        ]
        const del = new Set(selectBackupsToDelete(names, now))
        const kept = names.filter(n => !del.has(n))
        expect(kept.length).toBe(KEEP_RECENT)
        expect(kept).toContain('vault-20261004-2300.json')     // 10/04 最後一份
        expect(kept).toContain('vault-20261005-2200.json')     // 最新
    })

    it('事故情境：前幾天的完整備份不會被之後連續寫入的「空」備份擠掉', () => {
        const good = backupFileName(at(2026, 10, 3, 21))                       // 事故前最後一份好的
        const bad = Array.from({ length: 40 }, (_, i) => backupFileName(at(2026, 10, 4, 0, 0 + i)))  // 事故後狂寫
        const del = selectBackupsToDelete([good, ...bad], now)
        expect(del).not.toContain(good)
    })

    it(`超過 ${KEEP_DAYS} 天、又不在最新 ${KEEP_RECENT} 份裡的會被刪`, () => {
        const old = backupFileName(at(2026, 8, 1))
        const recent = Array.from({ length: KEEP_RECENT }, (_, h) => backupFileName(at(2026, 10, 5, h % 24, h)))
        expect(selectBackupsToDelete([old, ...recent], now)).toEqual([old])
    })

    it('非備份檔（圖片資料夾、升級前快照）永遠不刪', () => {
        const names = ['files', '升級前-Chromium138-20261005-2200', ...Array.from({ length: 60 }, (_, i) => backupFileName(at(2026, 10, 5, 0, i)))]
        const del = selectBackupsToDelete(names, now)
        expect(del).not.toContain('files')
        expect(del).not.toContain('升級前-Chromium138-20261005-2200')
    })
})
