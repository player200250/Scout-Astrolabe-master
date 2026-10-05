// src/utils/chromeGuard.test.ts — 主程序的降版防護（根目錄 chromeGuard.js；型別在 chromeGuard.d.ts）
import { describe, it, expect } from 'vitest'
import { chromeMajor, checkChromeDowngrade } from '../../chromeGuard.js'

describe('chromeMajor', () => {
    it('取主版號', () => {
        expect(chromeMajor('152.0.7977.130')).toBe(152)
        expect(chromeMajor('138.0.7204.251')).toBe(138)
    })
    it('格式不對回 null', () => {
        expect(chromeMajor(null)).toBeNull()
        expect(chromeMajor('')).toBeNull()
        expect(chromeMajor('abc')).toBeNull()
    })
})

describe('checkChromeDowngrade', () => {
    it('第一次跑（沒紀錄）放行並記下目前版本', () => {
        expect(checkChromeDowngrade(null, '138.0.7204.251')).toMatchObject({ ok: true, record: '138.0.7204.251' })
    })

    it('2026-10-05 事故：44 版（Chromium 152）用過之後，1.3.0（Chromium 138）必須被擋下', () => {
        const r = checkChromeDowngrade('152.0.7977.130', '138.0.7204.251')
        expect(r.ok).toBe(false)
        expect(r.storedMajor).toBe(152)
        expect(r.currentMajor).toBe(138)
        expect(r.record).toBe('152.0.7977.130')   // 紀錄不能被舊版改低
    })

    it('升版放行並把紀錄提高', () => {
        expect(checkChromeDowngrade('138.0.7204.251', '152.0.7977.130')).toMatchObject({ ok: true, record: '152.0.7977.130' })
    })

    it('同一個主版號（只差小版號）放行，紀錄不變', () => {
        expect(checkChromeDowngrade('152.0.7977.130', '152.0.7977.54')).toMatchObject({ ok: true, record: '152.0.7977.130' })
    })

    it('紀錄壞掉時放行（寧可照常啟動，也不要因為紀錄檔損壞而開不了）', () => {
        expect(checkChromeDowngrade('garbage', '138.0.7204.251').ok).toBe(true)
    })
})
