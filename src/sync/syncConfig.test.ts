// @vitest-environment jsdom
// src/sync/syncConfig.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
    loadSyncConfig, saveSyncConfig, clearSyncConfig, isSyncConfigured,
    isAutoSyncEnabled, setAutoSync, buildMobileConfigLink, parseMobileConfigLink,
} from './syncConfig'

const LONG_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy-anon-key-value'

describe('syncConfig', () => {
    beforeEach(() => { localStorage.clear() })

    it('沒設定過時回空字串，不會丟例外', () => {
        expect(loadSyncConfig()).toEqual({ url: '', anonKey: '', autoSync: true, mobileUrl: '' })
    })

    it('存了之後讀得回來', () => {
        saveSyncConfig({ url: 'https://abc.supabase.co', anonKey: LONG_KEY })
        expect(loadSyncConfig()).toEqual({ url: 'https://abc.supabase.co', anonKey: LONG_KEY, autoSync: true, mobileUrl: '' })
    })

    it('URL 尾端斜線會被去掉（否則組出來的 API path 會多一槓）', () => {
        saveSyncConfig({ url: 'https://abc.supabase.co///', anonKey: LONG_KEY })
        expect(loadSyncConfig().url).toBe('https://abc.supabase.co')
    })

    // 這組是真的踩過的：Supabase 後台有些欄位顯示的是 Data API endpoint
    // `https://xxx.supabase.co/rest/v1`，貼進來的話 supabase-js 會再接一段，
    // 組出 /rest/v1/auth/v1/token 而 404。正規化必須把路徑砍掉只留 origin。
    it('貼到帶路徑的 Data API endpoint（/rest/v1）會被砍成 origin', () => {
        saveSyncConfig({ url: 'https://abc.supabase.co/rest/v1', anonKey: LONG_KEY })
        expect(loadSyncConfig().url).toBe('https://abc.supabase.co')
    })

    it('其他常見誤貼的路徑一樣砍掉（/auth/v1、後台 dashboard 網址）', () => {
        saveSyncConfig({ url: 'https://abc.supabase.co/auth/v1/', anonKey: LONG_KEY })
        expect(loadSyncConfig().url).toBe('https://abc.supabase.co')
        saveSyncConfig({ url: 'https://abc.supabase.co/rest/v1?apikey=xxx', anonKey: LONG_KEY })
        expect(loadSyncConfig().url).toBe('https://abc.supabase.co')
    })

    it('沒打 https:// 也能用（自動補上）', () => {
        saveSyncConfig({ url: 'abc.supabase.co', anonKey: LONG_KEY })
        expect(loadSyncConfig().url).toBe('https://abc.supabase.co')
    })

    it('自架 Supabase 的非標準 port 會保留', () => {
        saveSyncConfig({ url: 'http://localhost:54321/rest/v1', anonKey: LONG_KEY })
        expect(loadSyncConfig().url).toBe('http://localhost:54321')
    })

    it('前後空白會被清掉（貼上時很容易帶到）', () => {
        saveSyncConfig({ url: '  https://abc.supabase.co  ', anonKey: `  ${LONG_KEY}  ` })
        expect(loadSyncConfig()).toEqual({ url: 'https://abc.supabase.co', anonKey: LONG_KEY, autoSync: true, mobileUrl: '' })
    })

    it('localStorage 內容壞掉時回空設定而不是讓 App 掛掉', () => {
        localStorage.setItem('astrolabe-sync-config', '{壞掉的 JSON')
        expect(loadSyncConfig()).toEqual({ url: '', anonKey: '', autoSync: true, mobileUrl: '' })
    })

    it('clear 之後回到未設定', () => {
        saveSyncConfig({ url: 'https://abc.supabase.co', anonKey: LONG_KEY })
        clearSyncConfig()
        expect(isSyncConfigured()).toBe(false)
    })

    describe('isSyncConfigured', () => {
        it('兩個值都填好才算設定完成', () => {
            expect(isSyncConfigured({ url: 'https://abc.supabase.co', anonKey: LONG_KEY })).toBe(true)
        })

        it('缺 URL / 缺 key / URL 不是網址 / key 太短 都算沒設定完成', () => {
            expect(isSyncConfigured({ url: '', anonKey: LONG_KEY })).toBe(false)
            expect(isSyncConfigured({ url: 'https://abc.supabase.co', anonKey: '' })).toBe(false)
            expect(isSyncConfigured({ url: 'abc.supabase.co', anonKey: LONG_KEY })).toBe(false)
            expect(isSyncConfigured({ url: 'https://abc.supabase.co', anonKey: 'short' })).toBe(false)
        })
    })

    describe('autoSync 開關', () => {
        const CONFIGURED = { url: 'https://abc.supabase.co', anonKey: LONG_KEY }

        it('設定填好且沒關掉時＝啟用', () => {
            expect(isAutoSyncEnabled({ ...CONFIGURED })).toBe(true)
            expect(isAutoSyncEnabled({ ...CONFIGURED, autoSync: true })).toBe(true)
        })

        it('明確關掉就停用', () => {
            expect(isAutoSyncEnabled({ ...CONFIGURED, autoSync: false })).toBe(false)
        })

        it('設定沒填完就算開著也不算啟用（沒東西可連）', () => {
            expect(isAutoSyncEnabled({ url: '', anonKey: '', autoSync: true, mobileUrl: '' })).toBe(false)
        })

        // 探路期存的設定沒有 autoSync 欄位；若把 undefined 當成「關閉」，
        // 使用者升級後會發現同步默默停了而且不知道為什麼
        it('舊設定（無 autoSync 欄位）視為開啟', () => {
            localStorage.setItem('astrolabe-sync-config', JSON.stringify(CONFIGURED))
            expect(loadSyncConfig().autoSync).toBe(true)
            expect(isAutoSyncEnabled()).toBe(true)
        })

        it('setAutoSync 只動開關、不動連線設定', () => {
            saveSyncConfig(CONFIGURED)
            setAutoSync(false)
            expect(loadSyncConfig()).toEqual({ ...CONFIGURED, autoSync: false, mobileUrl: '' })
            setAutoSync(true)
            expect(loadSyncConfig()).toEqual({ ...CONFIGURED, autoSync: true, mobileUrl: '' })
        })
    })
})

describe('手機設定連結', () => {
    const CFG = { url: 'https://abc.supabase.co', anonKey: LONG_KEY }

    it('產生的連結能被解回原本的設定（往返一致）', () => {
        const link = buildMobileConfigLink({ ...CFG, mobileUrl: 'https://example.com/app/' })
        expect(link.startsWith('https://example.com/app/#cfg=')).toBe(true)
        expect(parseMobileConfigLink(new URL(link).hash)).toEqual(CFG)
    })

    // 還在用區網 preview 測、還沒有固定網址時，只給片段讓使用者自己接
    it('沒填手機端網址時只回 #cfg= 片段', () => {
        const link = buildMobileConfigLink({ ...CFG })
        expect(link.startsWith('#cfg=')).toBe(true)
        expect(parseMobileConfigLink(link)).toEqual(CFG)
    })

    it('手機端網址已經帶 # 時不會多接一個', () => {
        const link = buildMobileConfigLink({ ...CFG, mobileUrl: 'https://example.com/app/#' })
        expect(link.split('#').length).toBe(2)
    })

    it('非 ASCII 的網址也能正確往返（base64 走 UTF-8）', () => {
        const cfg = { url: 'https://中文.example.com', anonKey: LONG_KEY }
        const link = buildMobileConfigLink({ ...cfg })
        expect(parseMobileConfigLink(link)).toEqual(cfg)
    })

    describe('parseMobileConfigLink 對壞輸入要安全', () => {
        it('沒有 cfg 參數回 null', () => {
            expect(parseMobileConfigLink('')).toBeNull()
            expect(parseMobileConfigLink('#other=1')).toBeNull()
        })

        it('base64 壞掉回 null 而不是丟例外', () => {
            expect(parseMobileConfigLink('#cfg=!!!not-base64!!!')).toBeNull()
        })

        it('解出來不是預期結構回 null', () => {
            expect(parseMobileConfigLink('#cfg=' + btoa('{"url":123}'))).toBeNull()
            expect(parseMobileConfigLink('#cfg=' + btoa('{"url":"","anonKey":""}'))).toBeNull()
        })

        it('夾在其他 fragment 參數之間也讀得到', () => {
            const payload = buildMobileConfigLink({ ...CFG }).slice('#cfg='.length)
            expect(parseMobileConfigLink(`#a=1&cfg=${payload}&b=2`)).toEqual(CFG)
        })
    })
})
