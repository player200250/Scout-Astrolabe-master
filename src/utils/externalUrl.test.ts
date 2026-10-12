// src/utils/externalUrl.test.ts — 哪些網址可以交給 shell.openExternal（根目錄 externalUrl.js）
import { describe, it, expect } from 'vitest'
import { isSafeExternalUrl } from '../../externalUrl.js'

describe('isSafeExternalUrl', () => {
    it('放行 http、https、mailto', () => {
        expect(isSafeExternalUrl('https://example.com/a?b=1')).toBe(true)
        expect(isSafeExternalUrl('http://example.com')).toBe(true)
        expect(isSafeExternalUrl('HTTPS://EXAMPLE.COM')).toBe(true)
        expect(isSafeExternalUrl('mailto:someone@example.com')).toBe(true)
        expect(isSafeExternalUrl('  https://example.com  ')).toBe(true)
    })

    it('擋掉會執行本機檔案或叫起其他程式的協定', () => {
        expect(isSafeExternalUrl('file:///C:/Windows/System32/calc.exe')).toBe(false)
        expect(isSafeExternalUrl('ms-settings:privacy')).toBe(false)
        expect(isSafeExternalUrl('search-ms:query=x')).toBe(false)
        expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
        expect(isSafeExternalUrl('smb://server/share')).toBe(false)
    })

    it('擋掉 renderer 內部才有意義的網址', () => {
        expect(isSafeExternalUrl('blob:file:///3f2a-uuid')).toBe(false)
        expect(isSafeExternalUrl('data:text/html,<b>x</b>')).toBe(false)
    })

    it('看起來像 http 但其實不是的也擋', () => {
        expect(isSafeExternalUrl('httpx://example.com')).toBe(false)
        expect(isSafeExternalUrl('http-evil:payload')).toBe(false)
    })

    it('不是字串、空字串、不完整的網址回 false', () => {
        expect(isSafeExternalUrl(undefined)).toBe(false)
        expect(isSafeExternalUrl(null)).toBe(false)
        expect(isSafeExternalUrl(42)).toBe(false)
        expect(isSafeExternalUrl('')).toBe(false)
        expect(isSafeExternalUrl('example.com')).toBe(false)
    })
})
